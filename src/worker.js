/*
    Worker for processing images off the main thread.
    Uses OffscreenCanvas for conversion.
*/

self.onmessage = async function(e) {
    const { id, file, quality } = e.data;

    try {
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
        
        let conversionOptions = {
            type: targetFormat,
        };

        // Quality is only supported for image/jpeg, image/webp and image/avif
        if (targetFormat === 'image/jpeg' || targetFormat === 'image/webp' || targetFormat === 'image/avif') {
             conversionOptions.quality = quality; // assumed 0..1
        }

        const blob = await canvas.convertToBlob(conversionOptions);

        // 6. Cleanup
        bitmap.close();

        // 7. Send back result
        self.postMessage({
            type: 'result',
            id,
            success: true,
            blob,
            // thumbnail: thumbnailBase64, // Not needed again
            originalSize: file.size,
            newSize: blob.size
        });

    } catch (error) {
        console.error('Worker conversion failed:', error);
        self.postMessage({
            id,
            success: false,
            error: error.message
        });
    }
};
