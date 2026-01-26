import { state } from './state.js';
import { updateVisuals, createCarouselCard } from './ui-controller.js';
import { formatSize } from './utils.js';

export function processQueue() {
    // Find ALL idle workers and assign jobs
    state.workerStatus.forEach((isBusy, i) => {
        if (!isBusy && state.queue.length > 0) {
            const job = state.queue.shift();
            const worker = state.workers[i];
            
            state.workerStatus[i] = true;
            // Store full job data including file and current target format for retrieval later
            state.processing.set(job.id, { ...job, startTime: Date.now(), targetFormat: state.format });

            // Update UI: Set to Processing (Spinner) - Quick Direct Update for responsiveness
            const card = document.getElementById(`carousel-${job.id}`);
            if (card) {
                // If the card exists (re-processing?), update status.
                // If it doesn't exist (lazy creation), this block is skipped, which is fine.
                const overlay = card.querySelector('.card-status-overlay');
                if (overlay) {
                     overlay.innerHTML = `<div class="status-icon processing"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg></div>`;
                     overlay.className = 'card-status-overlay'; 
                }
            }
            
            const row = document.getElementById(`file-${job.id}`);
            if (row) {
                 const sizeNew = row.querySelector('.size-new');
                 const text = (window.i18n && window.i18n.t('processing')) || 'Processing...';
                 if (sizeNew) sizeNew.textContent = text;
                 row.classList.add('processing');
            }

            // Check if SVG - process on main thread directly
            if (job.file.type === 'image/svg+xml') {
                // Free up worker immediately
                state.workerStatus[i] = false;
                
                // Continue processing queue with other workers
                processQueue();
                
                // Generate thumbnail for SVG first
                const img = new Image();
                const url = URL.createObjectURL(job.file);
                
                img.onload = () => {
                    // Create thumbnail
                    const thumbCanvas = document.createElement('canvas');
                    const thumbSize = 200;
                    const aspectRatio = img.width / img.height;
                    
                    if (aspectRatio > 1) {
                        thumbCanvas.width = thumbSize;
                        thumbCanvas.height = thumbSize / aspectRatio;
                    } else {
                        thumbCanvas.width = thumbSize * aspectRatio;
                        thumbCanvas.height = thumbSize;
                    }
                    
                    const thumbCtx = thumbCanvas.getContext('2d');
                    thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
                    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.8);
                    
                    URL.revokeObjectURL(url);
                    
                    // Create carousel card with thumbnail
                    createCarouselCard(job.id, thumbnail, job.file.name);
                    
                    // Now process the conversion
                    processOnMainThread(job.id, job.file);
                };
                
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    console.error('Failed to load SVG for thumbnail generation');
                    // Still try to process
                    processOnMainThread(job.id, job.file);
                };
                
                img.src = url;
            } else {
                // Map format select values to MIME types
                const formatMap = {
                    'webp': 'image/webp',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'avif': 'image/avif',
                    'gif': 'image/gif'
                };
                const mimeFormat = formatMap[state.format] || state.format || 'image/webp';
                
                worker.postMessage({
                    id: job.id,
                    file: job.file,
                    quality: state.quality / 100, 
                    format: mimeFormat
                });
            }
        }
    });

    // Backpressure Resume Logic
    if (state.parsing && state.parsing.active && state.queue.length < (state.workers.length * 2)) {
         if (typeof state.parsing.resume === 'function') {
             requestAnimationFrame(state.parsing.resume);
         }
    }
}


// Main thread conversion function (for SVGs and fallback cases)
function processOnMainThread(id, file) {
    const job = state.processing.get(id);
    if (!job) {
        console.warn(`Job ${id} not found for main thread processing`);
        return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // --- Generate Thumbnail for Carousel (Main Thread Fallback) ---
        const thumbCanvas = document.createElement('canvas');
        const thumbHeight = Math.min(200, canvas.height);
        const scale = thumbHeight / canvas.height;
        thumbCanvas.width = canvas.width * scale;
        thumbCanvas.height = thumbHeight;
        thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbData = thumbCanvas.toDataURL('image/jpeg', 0.8);
        
        handleWorkerMessage(-1, {
            data: { type: 'thumb', id, thumbnail: thumbData }
        });

        // Determine format/quality
        const targetFormat = (job && job.targetFormat) ? job.targetFormat : state.format;
        
        if (targetFormat === 'gif' && window.GifWriter) {
            // GIF processing via omggif - IMPROVED SAMPLING
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const rgba = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // 1. Better Palette Generation (Sampling)
            const colorCounts = new Map();
            const step = Math.max(1, Math.floor((width * height) / 5000)); // Sample ~5000 pixels
            
            for (let i = 0; i < rgba.length; i += 4 * step) {
                const alpha = rgba[i+3];
                if (alpha < 128) continue; // Skip transparency
                const r = rgba[i];
                const g = rgba[i+1];
                const b = rgba[i+2];
                // Quantize slightly to group similar colors
                const qr = r >> 3;
                const qg = g >> 3;
                const qb = b >> 3;
                const key = (qr << 10) | (qg << 5) | qb;
                colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
            }
            
            // Sort by frequency and take top X colors based on quality
            const qVal = (job && job.quality) ? job.quality : (state.quality / 100);
            const maxColors = Math.max(2, Math.floor(qVal * 256));

            const sortedColors = [...colorCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, maxColors)
                .map(entry => {
                    const key = entry[0];
                    const r = (key >> 10) << 3;
                    const g = ((key >> 5) & 0x1F) << 3;
                    const b = (key & 0x1F) << 3;
                    return (r << 16) | (g << 8) | b;
                });
            
            const palette = sortedColors;
            while (palette.length < 256) palette.push(0);
            
            // 2. Map Pixels to Palette (Nearest Color)
            const indices = new Uint8Array(width * height);
            const colorCache = new Map();
            
            for (let i = 0; i < rgba.length; i += 4) {
                const r = rgba[i];
                const g = rgba[i+1];
                const b = rgba[i+2];
                const key = (r << 16) | (g << 8) | b;
                
                let bestIdx = 0;
                if (colorCache.has(key)) {
                    bestIdx = colorCache.get(key);
                } else {
                    let minDist = Infinity;
                    for (let j = 0; j < maxColors; j++) {
                        const pr = (palette[j] >> 16) & 0xFF;
                        const pg = (palette[j] >> 8) & 0xFF;
                        const pb = palette[j] & 0xFF;
                        const dist = Math.pow(r - pr, 2) + Math.pow(g - pg, 2) + Math.pow(b - pb, 2);
                        if (dist < minDist) {
                            minDist = dist;
                            bestIdx = j;
                        }
                        if (dist === 0) break;
                    }
                    colorCache.set(key, bestIdx);
                }
                indices[i/4] = bestIdx;
            }
            
            try {
                const buffer = new Uint8Array(width * height * 2 + 1024);
                const gf = new GifWriter(buffer, width, height, { loop: 0 });
                gf.addFrame(0, 0, width, height, indices, { palette: palette });
                
                const gifBlob = new Blob([buffer.subarray(0, gf.end())], { type: 'image/gif' });
                
                handleWorkerMessage(-1, {
                    data: {
                        type: 'result',
                        id,
                        success: true,
                        blob: gifBlob,
                        originalSize: file.size,
                        newSize: gifBlob.size
                    }
                });
                return;
            } catch (err) {
                console.error("GIF encoding error:", err);
            }
        }

        const fmt = targetFormat === 'png' || targetFormat === 'jpeg' || targetFormat === 'webp' || targetFormat === 'avif'
                    ? `image/${targetFormat}` : 'image/webp';
        const quality = state.quality / 100;

        canvas.toBlob((blob) => {
            if (blob) {
                // Success: Handle as a result
                handleWorkerMessage(-1, {
                     data: {
                         type: 'result',
                         id,
                         success: true,
                         blob,
                         originalSize: file.size,
                         newSize: blob.size
                     }
                });
            } else {
                // Blob generation failed
                handleWorkerMessage(-1, {
                    data: { type: 'result', id, success: false, error: "Canvas toBlob failed" }
                });
            }
        }, fmt, quality);
    };

    img.onerror = () => {
        URL.revokeObjectURL(url);
        handleWorkerMessage(-1, {
            data: { type: 'result', id, success: false, error: "Image load failed" }
        });
    };

    img.src = url;
}

export function handleWorkerMessage(workerIndex, e) {
    const { type, id } = e.data;

    // --- CASE 1: THUMBNAIL READY ---
    if (type === 'thumb') {
        const { thumbnail } = e.data;
        
        let card = document.getElementById(`carousel-${id}`);
        if (!card) {
            // Card doesn't exist yet (lazy creation), so create it now
            const job = state.processing.get(id);
            if (job) {
                const fName = (job.file && job.file.name) ? job.file.name : `Image ${id}`;
                createCarouselCard(id, thumbnail, fName);
            }
        }
        
        // Update Status to Processing (Spinner) replacing default waiting
        card = document.getElementById(`carousel-${id}`);
        if (card) {
            const overlay = card.querySelector('.card-status-overlay');
            if (overlay) {
                 overlay.innerHTML = `<div class="status-icon processing"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg></div>`;
            }
        }
        
        return; 
    }

    // --- CASE 1.5: FALLBACK (Encoding Error from worker) ---
    if (type === 'fallback') {
        // 1. Free up the worker immediately
        if (workerIndex >= 0) {
            state.workerStatus[workerIndex] = false;
            processQueue();
        }

        const job = state.processing.get(id);
        if (!job) return;

        // 2. Process on main thread
        processOnMainThread(id, job.file);
        return;
    }


    // --- CASE 2: CONVERSION COMPLETE ---
    if (type === 'result') {
        const { success, blob, originalSize, newSize, error } = e.data;

        // Mark worker as idle
        if (workerIndex >= 0) state.workerStatus[workerIndex] = false;

        // Retrieve job data
        const job = state.processing.get(id);
        
        // Safety check: if job is missing (e.g. cleared state or race condition), fallback or skip
        if (!job && !success) {
            // If failed and no job data, just log and continue
            console.warn(`Job ${id} not found for result processing.`);
            state.renderDirty = true;
            processQueue();
            return;
        }

        const originalName = (job && job.file) ? job.file.name : `image_${id}`;
        
        // Use the format that was active when the job started
        const targetFormat = (job && job.targetFormat) ? job.targetFormat : state.format;
        
        const extMap = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/avif': '.avif',
            'jpeg': '.jpg',
            'png': '.png',
            'webp': '.webp',
            'avif': '.avif',
            'gif': '.gif'
        };
        const ext = extMap[targetFormat] || '.webp';
        
        // Remove existing extension and append the new one
        let baseName = originalName;
        const lastDotIndex = originalName.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            baseName = originalName.substring(0, lastDotIndex);
        }
        const newName = baseName + ext;

        if (success) {
            const oSize = Number(originalSize) || 0;
            const nSize = Number(newSize) || 0;
            const savedBytes = oSize - nSize;
            const savedPercent = oSize > 0 ? Math.round((savedBytes / oSize) * 100) : 0;

            // Store result
            const resultData = {
                blob,
                fileName: newName,
                originalSize: oSize,
                newSize: nSize
            };
            state.completed.set(id, resultData);

            // Update Stats
            state.totalOriginalSize = (state.totalOriginalSize || 0) + oSize;
            state.totalNewSize = (state.totalNewSize || 0) + nSize;

            // Diff Logic
            if (state.lastRunLookup && state.lastRunLookup.has(newName)) {
                const oldNewSize = state.lastRunLookup.get(newName);
                state.sessionDiff = (state.sessionDiff || 0) + (nSize - oldNewSize);
            }

            // Add to Carousel Queue (for buttons/final status)
            // Note: We don't need to re-send thumbnail if we already set it
            state.carouselQueue.push({ id, data: resultData, previewUrl: null });

            // Queue UI Update (File List)
            state.pendingRowUpdates.push({
                id,
                success: true,
                newSize: nSize,
                savedPercent,
                newName,
                blob
            });

        } else {
            console.error(error);
            state.pendingRowUpdates.push({
                id,
                success: false,
                error
            });
        }

        state.processing.delete(id);
        state.renderDirty = true; // Trigger main loop to process carouselQueue/rowUpdates

        // Process next
        processQueue();
    }
}
