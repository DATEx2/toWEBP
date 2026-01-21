/*
    Worker for processing images off the main thread.
    Uses OffscreenCanvas for conversion.
*/

self.onmessage = async function(e) {
    const { id, file, quality } = e.data;

    try {
        // 1. Decode the image
        const bitmap = await createImageBitmap(file);
        
        // 2. Create OffscreenCanvas
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        
        // 3. Draw image to canvas
        ctx.drawImage(bitmap, 0, 0);
        
        // 4. Convert to WebP
        // Quality mapped from 1-100 to 0.0-1.0
        const blob = await canvas.convertToBlob({
            type: 'image/webp',
            quality: quality / 100
        });

        // 5. Cleanup
        bitmap.close();

        // 6. Send back result
        self.postMessage({
            id,
            success: true,
            blob,
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
