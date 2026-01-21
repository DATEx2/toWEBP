document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const WORKER_COUNT = navigator.hardwareConcurrency || 4;
    
    // --- DOM Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const qualityInput = document.getElementById('quality');
    const qualityValue = document.getElementById('quality-value');
    const fileList = document.getElementById('file-list');
    const statsBar = document.getElementById('stats-bar');
    const filesCountSpan = document.getElementById('files-count');
    const totalSavedSpan = document.getElementById('total-saved');
    const downloadAllBtn = document.getElementById('download-all');
    const clearAllBtn = document.getElementById('clear-all');
    const template = document.getElementById('file-item-template');
    
    // Carousel Elements
    const carouselSection = document.getElementById('carousel-section');
    const carouselTrack = document.getElementById('carousel-track');
    const carouselTrackContainer = document.getElementById('carousel-track-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const carouselTemplate = document.getElementById('carousel-card-template');

    // --- State ---
    const state = {
        queue: [],          // Array of file objects waiting to be processed
        processing: new Map(), // Map of active job IDs
        completed: new Map(),  // Map of completed results {id: {blob, fileName, ...}}
        workers: [],        // Array of Worker objects
        workerStatus: [],   // Array of booleans (true = busy)
        quality: 80,
        nextId: 1
    };

    // --- Initialization ---
    initWorkers();
    updateQualityDisplay();

    // --- Event Listeners ---
    qualityInput.addEventListener('input', (e) => {
        state.quality = parseInt(e.target.value, 10);
        updateQualityDisplay();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = ''; // Reset to allow selecting same files
    });

    clearAllBtn.addEventListener('click', () => {
        // Clear UI
        fileList.innerHTML = '';
        carouselTrack.innerHTML = '';
        statsBar.classList.add('hidden');
        carouselSection.classList.add('hidden');
        
        // Clear State
        state.completed.clear();
        state.queue = [];
    });

    downloadAllBtn.addEventListener('click', async () => {
        if (state.completed.size === 0) return;
        
        const zip = new JSZip();
        let count = 0;

        for (const [id, data] of state.completed) {
            zip.file(data.fileName, data.blob);
            count++;
        }

        if (count > 0) {
            downloadAllBtn.textContent = 'Zipping...';
            const content = await zip.generateAsync({type: "blob"});
            downloadBlob(content, "converted_images.zip");
            downloadAllBtn.textContent = 'Download All (ZIP)';
        }
    });

    // Carousel Navigation
    prevBtn.addEventListener('click', () => {
        carouselTrackContainer.scrollBy({ left: -200, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        carouselTrackContainer.scrollBy({ left: 200, behavior: 'smooth' });
    });

    // --- Core Functions ---

    function initWorkers() {
        for (let i = 0; i < WORKER_COUNT; i++) {
            const worker = new Worker('worker.js');
            worker.onmessage = handleWorkerMessage(i);
            state.workers.push(worker);
            state.workerStatus.push(false); // Idle
        }
        console.log(`Initialized ${WORKER_COUNT} workers.`);
    }

    function updateQualityDisplay() {
        qualityValue.textContent = state.quality;
    }

    function handleFiles(files) {
        if (!files.length) return;

        statsBar.classList.remove('hidden');
        
        const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (fileArray.length === 0) return;

        let index = 0;
        const CHUNK_SIZE = 10; // Process 10 files per frame to keep UI responsive

        function processChunk() {
            const chunk = fileArray.slice(index, index + CHUNK_SIZE);
            const fragment = document.createDocumentFragment();
            const newJobs = [];

            chunk.forEach(file => {
                const id = state.nextId++;
                
                // Create UI Item
                const uiItem = createUiItem(id, file);
                fragment.appendChild(uiItem);
                
                // Prepare job
                newJobs.push({ id, file, uiElement: uiItem });
            });

            // Update DOM and State in one go for this chunk
            fileList.appendChild(fragment);
            state.queue.push(...newJobs);
            
            // Start processing this chunk immediately
            processQueue();
            updateStats();

            index += CHUNK_SIZE;
            
            if (index < fileArray.length) {
                // Schedule next chunk
                requestAnimationFrame(processChunk);
            }
        }

        // Start processing
        processChunk();
    }

    function createUiItem(id, file) {
        const clone = template.content.cloneNode(true);
        const el = clone.querySelector('.file-item');
        el.id = `file-${id}`;
        
        // Setup details
        el.querySelector('.file-name').textContent = file.name;
        el.querySelector('.size-old').textContent = formatSize(file.size);
        
        // Preview
        const img = el.querySelector('.file-preview');
        // create object URL for preview
        const url = URL.createObjectURL(file);
        img.src = url;
        // Don't revoke here, we might need it for the carousel
        el.dataset.previewUrl = url;

        // Status
        el.classList.add('converting');
        el.querySelector('.badge').textContent = 'Waiting...';

        return el;
    }

    async function addCarouselItem(id, data, previewUrl) {
        if (carouselSection.classList.contains('hidden')) {
            carouselSection.classList.remove('hidden');
        }

        const clone = carouselTemplate.content.cloneNode(true);
        const card = clone.querySelector('.carousel-card');
        card.id = `carousel-${id}`;

        // Set Image
        const img = card.querySelector('.card-preview');
        img.src = previewUrl; // Use the same blob URL from the list item

        // Set Filename
        card.querySelector('.card-filename').textContent = data.fileName;
        card.querySelector('.card-filename').title = data.fileName;

        // Helper to remove item
        const closeBtn = card.querySelector('.card-close-btn');
        closeBtn.onclick = () => {
            card.remove();
        };

        // Download Action
        const dwBtn = card.querySelector('.card-download-btn');
        dwBtn.onclick = () => downloadBlob(data.blob, data.fileName);

        // Append to track
        carouselTrack.appendChild(card);
        
        // Wait for image to be ready to paint prevents "white" empty scroll
        try {
            await img.decode();
        } catch (err) {
            console.warn('Image decode failed', err);
        }

        // Auto scroll to see the new item
        // Use a small timeout to ensure layout is settled
        setTimeout(() => {
            carouselTrackContainer.scrollTo({
                left: carouselTrackContainer.scrollWidth,
                behavior: 'smooth'
            });
        }, 50);
    }

    function processQueue() {
        // Find idle workers
        const idleWorkerIndex = state.workerStatus.findIndex(busy => !busy);
        
        if (idleWorkerIndex !== -1 && state.queue.length > 0) {
            // Assign job
            const job = state.queue.shift();
            const worker = state.workers[idleWorkerIndex];
            
            state.workerStatus[idleWorkerIndex] = true; // Mark busy
            state.processing.set(job.id, job);

            // Update UI
            const row = document.getElementById(`file-${job.id}`);
            if (row) {
                row.querySelector('.badge').textContent = 'Processing...';
            }

            // Send to worker
            worker.postMessage({
                id: job.id,
                file: job.file,
                quality: state.quality
            });

            // Try to assign more if we have multiple idle workers
            processQueue();
        }
    }

    function handleWorkerMessage(workerIndex) {
        return (e) => {
            const { id, success, blob, originalSize, newSize, error } = e.data;
            
            // Mark worker as idle
            state.workerStatus[workerIndex] = false;
            
            // UI Update
            const row = document.getElementById(`file-${id}`);
            if (row) {
                row.classList.remove('converting');
                
                if (success) {
                    const savedBytes = originalSize - newSize;
                    const savedPercent = Math.round((savedBytes / originalSize) * 100);
                    const newName = row.querySelector('.file-name').textContent.replace(/\.[^/.]+$/, "") + ".webp";

                    row.querySelector('.size-new').textContent = formatSize(newSize);
                    
                    const badge = row.querySelector('.badge');
                    badge.textContent = `-${savedPercent}%`;
                    badge.classList.add('success');

                    // Setup individual download
                    const dlBtn = row.querySelector('.download-btn');
                    dlBtn.disabled = false;
                    dlBtn.onclick = () => downloadBlob(blob, newName);

                    // Store result
                    const resultData = {
                        blob, 
                        fileName: newName,
                        originalSize,
                        newSize
                    };
                    state.completed.set(id, resultData);

                    // Add to Carousel
                    const previewUrl = row.dataset.previewUrl;
                    addCarouselItem(id, resultData, previewUrl);

                } else {
                    row.querySelector('.badge').textContent = 'Error';
                    console.error(error);
                }
            }

            state.processing.delete(id);
            updateStats();
            
            // Process next
            processQueue();
        };
    }

    function updateStats() {
        const count = state.completed.size;
        filesCountSpan.textContent = `${count} file${count !== 1 ? 's' : ''} converted`;

        let savedTotal = 0;
        for (const data of state.completed.values()) {
            savedTotal += (data.originalSize - data.newSize);
        }
        
        totalSavedSpan.textContent = `Saved ${formatSize(savedTotal)}`;
    }

    // --- Helpers ---

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});
