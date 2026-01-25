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
            // Store full job data including file for retrieval later
            state.processing.set(job.id, { ...job, startTime: Date.now() });

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
                    'avif': 'image/avif'
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

        // Determine format/quality
        const fmt = state.format === 'png' || state.format === 'jpeg' || state.format === 'webp' || state.format === 'avif'
                    ? `image/${state.format}` : 'image/webp';
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
        
        const extMap = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/avif': '.avif'
        };
        const ext = extMap[state.format] || '.webp';
        const newName = originalName.replace(/\.[^/.]+$/, "") + ext;

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
