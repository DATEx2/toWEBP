/*
    Worker for processing images off the main thread.
    Uses OffscreenCanvas for conversion.
*/

self.onmessage = async function(e) {
    const { id, file, quality } = e.data;

    try {
        // 0. Special Handling for SVG
        // Workers have poor support for SVG rasterization (createImageBitmap often fails).
        // Skip directly to main thread fallback for highest reliability.
        if (file.type === 'image/svg+xml') {
            throw new Error('SVG detected - requesting main thread conversion');
        }

        // 1. Decode the image
        const bitmap = await createImageBitmap(file);

        // --- PHASE 1: Fast Thumbnail Generation ---
        // Max height 480px, but do NOT upscale if smaller
        const thumbHeight = Math.min(480, bitmap.height);
        const scaleFactor = thumbHeight / bitmap.height;
        const thumbWidth = bitmap.width * scaleFactor;
        
        const thumbCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCtx.drawImage(bitmap, 0, 0, thumbWidth, thumbHeight);
        
        const thumbBlob = await thumbCanvas.convertToBlob({
            type: 'image/webp',
            quality: 0.65 
        });
        
        // Convert Blob to Base64
        const reader = new FileReader();
        const thumbnailBase64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(thumbBlob);
        });

        // Send Thumbnail IMMEDIATELY
        self.postMessage({
            type: 'thumb',
            id,
            thumbnail: thumbnailBase64
        });

        // --- PHASE 2: Main Conversion ---
        // 2. Create OffscreenCanvas
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        
        // 3. Draw image to canvas
        ctx.drawImage(bitmap, 0, 0);
        
        // 4. Convert
        // Adjust type based on input request
        const targetFormat = e.data.format || 'image/webp';
        
        // --- SPECIAL CASE: GIF ENCODING (via omggif) ---
        if (targetFormat === 'image/gif') {
            try {
                // 1. Load omggif if not present
                if (typeof GifWriter === 'undefined') {
                    importScripts('https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.min.js');
                }

                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const rgba = imageData.data;
                const { width, height } = canvas;

                // 2. Optimized Palette Generation (Sampling)
                const colorCounts = new Map();
                const sampleStep = Math.max(1, Math.floor((width * height) / 10000));
                
                for (let i = 0; i < rgba.length; i += 4 * sampleStep) {
                    if (rgba[i+3] < 128) continue; 
                    const key = (rgba[i] << 16) | (rgba[i+1] << 8) | rgba[i+2];
                    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
                }

                // Map quality (0..1) to color count (2..256)
                const maxColors = Math.max(2, Math.floor(quality * 256));

                const palette = [...colorCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, maxColors)
                    .map(e => e[0]);
                
                while (palette.length < 256) palette.push(0);

                // 3. Fast Color Mapping (with Cache)
                const indices = new Uint8Array(width * height);
                const colorCache = new Map();
                
                for (let i = 0; i < rgba.length; i += 4) {
                    const r = rgba[i], g = rgba[i+1], b = rgba[i+2];
                    const key = (r << 16) | (g << 8) | b;
                    
                    let bestIdx = colorCache.get(key);
                    if (bestIdx === undefined) {
                        let minDist = Infinity;
                        for (let j = 0; j < maxColors; j++) {
                            const pr = (palette[j] >> 16) & 0xFF, pg = (palette[j] >> 8) & 0xFF, pb = palette[j] & 0xFF;
                            const d = (r-pr)*(r-pr) + (g-pg)*(g-pg) + (b-pb)*(b-pb);
                            if (d < minDist) { minDist = d; bestIdx = j; }
                            if (d === 0) break;
                        }
                        colorCache.set(key, bestIdx);
                    }
                    indices[i/4] = bestIdx;
                }

                const buffer = new Uint8Array(width * height * 2 + 1024);
                const gf = new GifWriter(buffer, width, height, { loop: 0 });
                gf.addFrame(0, 0, width, height, indices, { palette: palette });
                const blob = new Blob([buffer.subarray(0, gf.end())], { type: 'image/gif' });

                bitmap.close();
                self.postMessage({ type: 'result', id, success: true, blob, originalSize: file.size, newSize: blob.size });
                return;
            } catch (gifErr) {
                console.warn("GIF Worker Error, falling back to basic:", gifErr);
                // Fallback to basic convertToBlob below
            }
        }

        let conversionOptions = {
            type: targetFormat,
        };

        // Quality is only supported for image/jpeg, image/webp and image/avif
        if (targetFormat === 'image/jpeg' || targetFormat === 'image/webp' || targetFormat === 'image/avif') {
             conversionOptions.quality = quality; // assumed 0..1
        }

        let blob = await canvas.convertToBlob(conversionOptions);

        // --- SAFARI / LEGACY FALLBACK: If native WebP fails, use WASM ---
        if (targetFormat === 'image/webp' && blob.type !== 'image/webp') {
            try {
                // 1. Load WebP WASM Encoder if not present
                // We use a reputable CDN for libwebp WASM
                if (typeof libwebp === 'undefined') {
                    importScripts('https://cdn.jsdelivr.net/npm/webp-converters-browser@1.0.3/dist/webp-converters-browser.min.js');
                }

                // 2. Get RGBA data
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // 3. Encode via WASM
                // Note: The specific API depends on the library. webp-converters-browser uses a simple approach.
                const webpBuffer = await WebpConverter.encode(imageData.data, canvas.width, canvas.height, quality * 100);
                blob = new Blob([webpBuffer], { type: 'image/webp' });
            } catch (wasmErr) {
                console.warn("WASM WebP Fallback failed:", wasmErr);
                // Keep the initial blob (likely PNG fallback) if all else fails
            }
        }

        // 6. Cleanup
        bitmap.close();

        // 7. Send back result
        self.postMessage({
            type: 'result',
            id,
            success: true,
            blob,
            originalSize: file.size,
            newSize: blob.size
        });
    } catch (error) {
        // Log as debug, since fallback is a valid recovery strategy
        console.debug('Worker conversion skipped/failed, requesting fallback:', error.message);
        
        // If it's an encoding error or specific SVG issue, request main thread fallback
        self.postMessage({
            type: 'fallback',
            id,
            error: error.toString()
        });
    }
};
