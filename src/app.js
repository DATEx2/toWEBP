import { state, initWorkers, resetState } from './modules/state.js';
import { elements } from './modules/dom.js';
import { processQueue, handleWorkerMessage } from './modules/worker-manager.js';
import { updateVisuals, drawRings, updateQualityDisplay, updateStats, createUiItem, createCarouselCard } from './modules/ui-controller.js';
import { initLanguageSystem } from './modules/i18n.js';
import { initParallax } from './modules/parallax.js';
import { initAnalytics } from './modules/analytics.js';
import { processCarouselBatch, updateCarouselScroll, initCarouselDocs, closeLightbox, nextImage, prevImage, resetCarouselSortFlag } from './modules/carousel.js';
import { downloadBlob } from './modules/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // Force scroll to top
    if (history.scrollRestoration) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // Initialization
    const WORKER_COUNT = Math.max(2, (navigator.hardwareConcurrency || 4) - 1);
    
    // Override state.initWorkers to pass message handler
    // We need to bind the handler logic since it depends on UI Controller updates
    // Actually worker-manager handles message and imports UI Controller functions.
    // But we need to attach the event listener to the workers.
    // In state.js we created workers but didn't attach listeners.
    
    console.log(`Initializing ${WORKER_COUNT} workers...`);
    for (let i = 0; i < WORKER_COUNT; i++) {
        // Use URL-based resolution relative to this module (app.js)
        const worker = new Worker(new URL('./worker.js', import.meta.url)); 
        worker.onmessage = (e) => handleWorkerMessage(i, e);
        state.workers.push(worker);
        state.workerStatus.push(false);
    }

    updateQualityDisplay();
    initParallax();
    initLanguageSystem();
    initAnalytics();
    initCarouselDocs();

    // Start UI Loop
    requestAnimationFrame(renderLoop);

    // --- Main UI Loop ---
    function renderLoop() {
        if (state.renderDirty) {
            updateVisuals();
            state.renderDirty = false;
        }
        drawRings();
        updateCarouselScroll();
        processCarouselBatch();
        requestAnimationFrame(renderLoop);
    }

    // --- Scroll Handler ---
    if (elements.scrollSentinel) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) document.body.classList.add('scrolled');
                else document.body.classList.remove('scrolled');
            });
        }, { threshold: 0 });
        observer.observe(elements.scrollSentinel);
    }

    // --- Event Listeners ---

    // Format Tabs
    if (elements.formatTabs) {
        const savedFmt = localStorage.getItem('towebp_format') || 'webp';
        state.format = savedFmt;
        
        const setActiveTab = (fmt) => {
             elements.formatTabs.querySelectorAll('.format-tab').forEach(btn => {
                 if (btn.dataset.format === fmt || `image/${btn.dataset.format}` === fmt) btn.classList.add('active');
                 else btn.classList.remove('active');
             });
        };
        setActiveTab(savedFmt);

        elements.formatTabs.addEventListener('click', (e) => {
             if (e.target.classList.contains('format-tab')) {
                 const val = e.target.dataset.format;
                 state.format = val;
                 localStorage.setItem('towebp_format', val);
                 setActiveTab(val);
                 if (elements.qualityInput) {
                     elements.qualityInput.dispatchEvent(new Event('change'));
                 }
             }
        });
    }

    // Quality Input
    if (elements.qualityInput) {
        elements.qualityInput.addEventListener('input', (e) => {
            state.quality = parseInt(e.target.value, 10);
            updateQualityDisplay();
        });

        // Reprocessing Logic
        elements.qualityInput.addEventListener('change', () => {
            if (!state.loadedFiles || state.loadedFiles.length === 0) return;

            // 1. Build Lookup
            state.lastRunLookup = new Map();
            for (const [id, data] of state.completed) {
                state.lastRunLookup.set(data.fileName, data.newSize);
            }
            state.sessionDiff = 0;

            // 2. Reset Workers
            state.workers.forEach(w => w.terminate());
            state.workers = [];
            state.workerStatus = [];
            
            // Re-init workers
            for (let i = 0; i < WORKER_COUNT; i++) {
                const worker = new Worker('src/worker.js'); 
                worker.onmessage = (e) => handleWorkerMessage(i, e);
                state.workers.push(worker);
                state.workerStatus.push(false);
            }

            // 3. Reset State but keep Files
            resetState();
            
            // Restore file list from loadedFiles
            state.parsingTarget = state.loadedFiles.length;

            // 4. Reset UI
            // Carousel pending
            const cards = elements.carouselTrack.querySelectorAll('.carousel-card');
            cards.forEach(card => card.classList.add('pending'));

            state.visual.innerProgress = 0;
            state.visual.innerTarget = 0;
            state.visual.outerProgress = 0;
            state.visual.outerTarget = 0;

            // Reset File List Rows
            const rows = elements.fileList.children;
            state.loadedFiles.forEach((file, i) => {
                 const row = rows[i];
                 if (!row) return;
                 
                 const id = row.id.replace('file-', '');
                 
                 const sizeNewEl = row.querySelector('.size-new');
                 const badge = row.querySelector('.badge');
                 if (sizeNewEl) {
                     sizeNewEl.textContent = (window.i18n && window.i18n.t('waiting')) || 'Waiting...';
                     sizeNewEl.className = 'size-new text-muted';
                 }
                 if (badge) {
                     badge.className = 'badge badge-pending';
                     badge.textContent = 'Pending';
                     badge.classList.remove('hidden');
                 }
                 row.classList.remove('success', 'error', 'processing');

                 state.queue.push({ id, file });
                 state.totalFilesCount++;
            });

            processQueue();
        });
    }

    // Lightbox & Keys
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
             const overlay = document.querySelector('.image-zoom-overlay');
             if (overlay) overlay.remove();
             closeLightbox();
        }
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const isLightboxOpen = elements.lightbox && !elements.lightbox.classList.contains('hidden');
        if (isLightboxOpen) {
             if (e.key === 'ArrowRight') nextImage();
             else if (e.key === 'ArrowLeft') prevImage();
             return;
        }
        
        // Carousel Scroll Keys
        if (elements.carouselTrack && !elements.carouselSection.classList.contains('hidden')) {
             if (e.key === 'ArrowRight') elements.carouselTrackContainer.scrollBy({ left: 300, behavior: 'smooth' });
             else if (e.key === 'ArrowLeft') elements.carouselTrackContainer.scrollBy({ left: -300, behavior: 'smooth' });
        }
    });

    // --- Drag & Drop ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
        }, false);
    });

    let dragCounter = 0;
    ['dragenter', 'dragover'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            if (eventName === 'dragenter') dragCounter++;
            elements.dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            if (eventName === 'dragleave') dragCounter--;
            if (dragCounter === 0 || eventName === 'drop') {
                elements.dropZone.classList.remove('drag-over');
                dragCounter = 0;
            }
        });
    });

    window.addEventListener('drop', (e) => {
        handleFiles(e.dataTransfer.files);
    });

    elements.dropZone.addEventListener('click', (e) => {
        const pie = document.getElementById('pie-chart');
        if (pie && (e.target === pie || pie.contains(e.target))) {
            elements.fileInput.click();
        }
    });

    elements.fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        elements.fileInput.value = '';
    });

    // Clear All
    const performClear = () => {
        elements.fileList.innerHTML = '';
        elements.carouselTrack.innerHTML = '';
        // In app.js: dropStats always visible now. Reset state.
        
        // Close Carousel Animation
        if (elements.carouselSection) {
            elements.carouselSection.classList.remove('open');
            setTimeout(() => {
                // Only hide if it wasn't re-opened quickly
                if (!elements.carouselSection.classList.contains('open')) {
                    elements.carouselSection.classList.add('hidden');
                }
            }, 600); // Match CSS transition duration
        }

        resetState();
        
        if (elements.pieDefaultContent) elements.pieDefaultContent.classList.remove('hidden');
        if (elements.pieActiveContent) elements.pieActiveContent.classList.add('hidden');
        
        updateStats(); // Will hide sticky stats
        document.body.classList.remove('expanded');
    };

    if (elements.clearAllBtn) elements.clearAllBtn.addEventListener('click', performClear);
    if (elements.headerClearBtn) elements.headerClearBtn.addEventListener('click', performClear);

    // Download All
    const performDownloadAll = async () => {
        if (state.completed.size === 0) return;
        const btn = elements.downloadAllBtn || elements.headerDownloadBtn;
        if (btn) btn.textContent = 'Zipping...'; // localize?
        
        const zip = new JSZip();
        for (const [id, data] of state.completed) {
            zip.file(data.fileName, data.blob);
        }
        
        const content = await zip.generateAsync({ type: "blob" });
        downloadBlob(content, "converted_images.zip");
        if (btn) btn.textContent = (window.i18n && window.i18n.t('download_zip')) || 'Download ZIP';
    };

    if (elements.downloadAllBtn) elements.downloadAllBtn.addEventListener('click', performDownloadAll);
    if (elements.headerDownloadBtn) elements.headerDownloadBtn.addEventListener('click', performDownloadAll);


    // --- File Handling Logic ---
    function handleFiles(files) {
        if (!files.length) return;
        if (elements.downloadAllBtn) elements.downloadAllBtn.disabled = true;

        const rawFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (rawFiles.length === 0) return;

        const fileArray = [];
        rawFiles.forEach(f => {
            const sig = `${f.name}-${f.size}-${f.lastModified}`;
            if (!state.fileSignatures.has(sig)) {
                state.fileSignatures.add(sig);
                fileArray.push(f);
            }
        });

        if (fileArray.length === 0) return;

        // UI Prep
        if (elements.carouselSection) {
            elements.carouselSection.classList.remove('hidden');
            // Trigger reflow
            void elements.carouselSection.offsetWidth;
            requestAnimationFrame(() => {
                elements.carouselSection.classList.add('open');
            });
        }

        if (elements.dropInitial) elements.dropInitial.classList.add('hidden');
        if (elements.dropStats) elements.dropStats.classList.remove('hidden');

        if (elements.pieDefaultContent) elements.pieDefaultContent.classList.add('hidden');
        if (elements.pieActiveContent) elements.pieActiveContent.classList.remove('hidden');

        document.body.classList.add('expanded');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        state.loadedFiles.push(...fileArray);
        resetCarouselSortFlag(); // Allow re-sorting when this batch completes
        
        const batchSize = fileArray.reduce((acc, f) => acc + f.size, 0);
        state.grandTotalInputSize = (state.grandTotalInputSize || 0) + batchSize;
        state.parsingTarget += fileArray.length;

        if (elements.pieMainText) elements.pieMainText.textContent = (window.i18n && window.i18n.t('processing')) || 'Processing';
        if (elements.pieSubText) elements.pieSubText.textContent = (window.i18n && window.i18n.t('parsing_files')) || 'Parsing...';

        state.parsing = {
            active: true,
            fileArray: fileArray,
            index: 0,
            resume: processNextChunk
        };

        setTimeout(() => {
             processNextChunk();
        }, 600);

        const CHUNK_SIZE = Math.max(state.workers.length, 4);
        const MAX_QUEUE = state.workers.length * 2;

        function processNextChunk() {
            if (!state.parsing.active) return;
            const queueSize = state.queue.length;

            if (state.parsing.index > 0 && queueSize > MAX_QUEUE) return;

            const { index, fileArray } = state.parsing;
            const chunk = fileArray.slice(index, index + CHUNK_SIZE);

            if (chunk.length === 0) {
                state.parsing.active = false;
                state.renderDirty = true;
                return;
            }

            const fragment = document.createDocumentFragment();
            const newJobs = [];

            chunk.forEach(file => {
                const id = state.nextId++;
                const originalIndex = state.totalFilesCount + newJobs.length; // Track original order
                state.originalOrder.set(id, originalIndex);
                
                const uiItem = createUiItem(id, file);
                fragment.appendChild(uiItem);
                
                // Placeholder card REMOVED
                // createCarouselCard(id, file);
                
                newJobs.push({ id, file });
            });

            elements.fileList.appendChild(fragment);
            state.queue.push(...newJobs);
            state.totalFilesCount += chunk.length;
            state.parsing.index += CHUNK_SIZE;

            processQueue();
            state.renderDirty = true;

            if (state.parsing.index < fileArray.length) {
                requestAnimationFrame(processNextChunk);
            } else {
                state.parsing.active = false;
                state.renderDirty = true;
            }
        }
    }

});
