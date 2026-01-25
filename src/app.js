import { state, initWorkers, resetState } from './modules/state.js';
import { elements } from './modules/dom.js';
import { processQueue, handleWorkerMessage } from './modules/worker-manager.js';
import { updateVisuals, drawRings, updateQualityDisplay, updateStats, createUiItem, createCarouselCard } from './modules/ui-controller.js';
import { initLanguageSystem } from './modules/i18n.js';
import { initParallax } from './modules/parallax.js';
import { initAnalytics } from './modules/analytics.js';
import { initScrollReveal } from './modules/scroll-reveal.js';
import { updateCarouselScroll, initCarouselDocs, processCarouselBatch, resetCarouselSortFlag, closeLightbox, nextImage, prevImage } from './modules/carousel.js';
import { downloadBlob } from './modules/utils.js';


$(function() {
    // Force scroll to top
    if (history.scrollRestoration) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // Initialization
    const WORKER_COUNT = Math.max(2, (navigator.hardwareConcurrency || 4) - 1);
    
    initWorkers(WORKER_COUNT, handleWorkerMessage);

    updateQualityDisplay();
    initParallax();
    initLanguageSystem();
    initAnalytics();
    initCarouselDocs();
    initScrollReveal();

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
    if (elements.scrollSentinel.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) $('body').addClass('scrolled');
                else $('body').removeClass('scrolled');
            });
        }, { threshold: 0 });
        // Interact with raw DOM element
        observer.observe(elements.scrollSentinel[0]);
    }

    // --- Event Listeners ---

    // Format Tabs
    if (elements.formatTabs.length) {
        const savedFmt = localStorage.getItem('towebp_format') || 'webp';
        state.format = savedFmt;
        
        const setActiveTab = (fmt) => {
             elements.formatTabs.find('.format-tab').each(function() {
                 const $btn = $(this);
                 if ($btn.data('format') === fmt || `image/${$btn.data('format')}` === fmt) $btn.addClass('active');
                 else $btn.removeClass('active');
             });
        };
        setActiveTab(savedFmt);

        elements.formatTabs.on('click', '.format-tab', function(e) {
             const val = $(this).data('format');
             state.format = val;
             localStorage.setItem('towebp_format', val);
             setActiveTab(val);
             if (elements.qualityInput.length) {
                 elements.qualityInput.trigger('change');
             }
        });
    }

    // Quality Input
    if (elements.qualityInput.length) {
        // Initialize quality from localStorage
        const savedQuality = localStorage.getItem('towebp_quality');
        if (savedQuality) {
            state.quality = parseInt(savedQuality, 10);
            elements.qualityInput.val(state.quality);
            updateQualityDisplay();
        }

        elements.qualityInput.on('input', function(e) {
            state.quality = parseInt($(this).val(), 10);
            localStorage.setItem('towebp_quality', state.quality);
            updateQualityDisplay();
        });

        // Reprocessing Logic
        elements.qualityInput.on('change', () => {
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
            
            initWorkers(WORKER_COUNT, handleWorkerMessage);

            // 3. Reset State but keep Files & Order
            const savedFiles = [...state.loadedFiles];
            const savedOrder = new Map(state.originalOrder);
            
            resetState();
            
            state.loadedFiles = savedFiles;
            state.originalOrder = savedOrder;
            state.parsingTarget = state.loadedFiles.length;
            state.grandTotalInputSize = state.loadedFiles.reduce((acc, f) => acc + f.size, 0);

            // 4. Reset UI
            // Carousel pending
            elements.carouselTrack.find('.carousel-card').addClass('pending');

            state.visual.innerProgress = 0;
            state.visual.innerTarget = 0;
            state.visual.outerProgress = 0;
            state.visual.outerTarget = 0;

            // Reset File List Rows
            elements.fileList.children().each(function(i) {
                 const $row = $(this);
                 
                 const id = parseInt($row.attr('id').replace('file-', ''), 10);
                 
                 const $sizeNewEl = $row.find('.size-new');
                 const $badge = $row.find('.badge');
                 if ($sizeNewEl.length) {
                     $sizeNewEl.text((window.i18n && window.i18n.t('waiting')) || 'Waiting...');
                     $sizeNewEl.attr('class', 'size-new text-muted');
                 }
                 if ($badge.length) {
                     $badge.attr('class', 'badge badge-pending');
                     $badge.text('Pending');
                     $badge.removeClass('hidden');
                 }
                 $row.removeClass('success error processing');

                 state.queue.push({ id, file: state.loadedFiles[i] });
                 state.totalFilesCount++;
            });

            processQueue();
        });
    }

    // Lightbox & Keys
    $(document).on('keydown', (e) => {
        if (e.key === 'Escape') {
             $('.image-zoom-overlay').remove();
             closeLightbox();
        }
        
        if ($(e.target).is('input, textarea')) return;

        const isLightboxOpen = elements.lightbox.length && !elements.lightbox.hasClass('hidden');
        if (isLightboxOpen) {
             if (e.key === 'ArrowRight') nextImage();
             else if (e.key === 'ArrowLeft') prevImage();
             return;
        }
        
        // Carousel Scroll Keys
        if (elements.carouselTrack.length && !elements.carouselSection.hasClass('hidden')) {
             // Access raw element for scrollBy
             if (e.key === 'ArrowRight') elements.carouselTrackContainer[0].scrollBy({ left: 300, behavior: 'smooth' });
             else if (e.key === 'ArrowLeft') elements.carouselTrackContainer[0].scrollBy({ left: -300, behavior: 'smooth' });
        }
    });

    // --- Drag & Drop ---
    const dragEvents = ['dragenter', 'dragover', 'dragleave', 'drop'];
    dragEvents.forEach(eventName => {
        $(window).on(eventName, (e) => {
            e.preventDefault(); 
            e.stopPropagation();
        });
    });

    let dragCounter = 0;
    $(window).on('dragenter', () => {
        dragCounter++;
        elements.dropZone.addClass('drag-over');
    }).on('dragover', () => {
        elements.dropZone.addClass('drag-over');
    }).on('dragleave', () => {
        dragCounter--;
        if (dragCounter === 0) elements.dropZone.removeClass('drag-over');
    }).on('drop', (e) => {
        dragCounter = 0;
        elements.dropZone.removeClass('drag-over');
        // Handle files - jQuery event needs originalEvent for dataTransfer
        if (e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.files.length) {
            handleFiles(e.originalEvent.dataTransfer.files);
        }
    });

    elements.dropZone.on('click', (e) => {
        const pie = document.getElementById('pie-chart');
        // Check if click was on or inside pie
        if (pie && (e.target === pie || $.contains(pie, e.target))) {
            elements.fileInput.click();
        }
    });

    elements.fileInput.on('change', function(e) {
        handleFiles(this.files);
        this.value = '';
    });

    // Clear All
    const performClear = () => {
        elements.fileList.empty();
        elements.carouselTrack.empty();
        // In app.js: dropStats always visible now. Reset state.
        
        // Close Carousel Animation
        if (elements.carouselSection.length) {
            elements.carouselSection.removeClass('open');
            setTimeout(() => {
                // Only hide if it wasn't re-opened quickly
                if (!elements.carouselSection.hasClass('open')) {
                    elements.carouselSection.addClass('hidden');
                }
            }, 600); // Match CSS transition duration
        }

        resetState();
        
        if (elements.pieDefaultContent.length) elements.pieDefaultContent.removeClass('hidden');
        if (elements.pieActiveContent.length) elements.pieActiveContent.addClass('hidden');
        
        updateStats(); // Will hide sticky stats
        $('body').removeClass('expanded');
    };

    if (elements.clearAllBtn.length) elements.clearAllBtn.on('click', performClear);
    if (elements.headerClearBtn.length) elements.headerClearBtn.on('click', performClear);

    // Download All
    const performDownloadAll = async () => {
        if (state.completed.size === 0) return;
        const $btn = elements.downloadAllBtn.length ? elements.downloadAllBtn : elements.headerDownloadBtn;
        if ($btn.length) $btn.text('Zipping...'); 
        
        const zip = new JSZip();
        for (const [id, data] of state.completed) {
            zip.file(data.fileName, data.blob);
        }
        
        const content = await zip.generateAsync({ type: "blob" });
        downloadBlob(content, "converted_images.zip");
        if ($btn.length) $btn.text((window.i18n && window.i18n.t('download_zip')) || 'Download ZIP');
    };

    if (elements.downloadAllBtn.length) elements.downloadAllBtn.on('click', performDownloadAll);
    if (elements.headerDownloadBtn.length) elements.headerDownloadBtn.on('click', performDownloadAll);


    // --- File Handling Logic ---
    function handleFiles(files) {
        if (!files.length) return;
        if (elements.downloadAllBtn.length) elements.downloadAllBtn.prop('disabled', true);

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
        if (elements.carouselSection.length) {
            elements.carouselSection.removeClass('hidden');
            // Trigger reflow
            void elements.carouselSection[0].offsetWidth;
            requestAnimationFrame(() => {
                elements.carouselSection.addClass('open');
            });
        }

        if (elements.dropInitial.length) elements.dropInitial.addClass('hidden');
        if (elements.dropStats.length) elements.dropStats.removeClass('hidden');

        if (elements.pieDefaultContent.length) elements.pieDefaultContent.addClass('hidden');
        if (elements.pieActiveContent.length) elements.pieActiveContent.removeClass('hidden');

        $('body').addClass('expanded');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        state.loadedFiles.push(...fileArray);
        resetCarouselSortFlag(); // Allow re-sorting when this batch completes
        
        const batchSize = fileArray.reduce((acc, f) => acc + f.size, 0);
        state.grandTotalInputSize = (state.grandTotalInputSize || 0) + batchSize;
        state.parsingTarget += fileArray.length;

        if (elements.pieMainText.length) elements.pieMainText.text((window.i18n && window.i18n.t('processing')) || 'Processing');
        if (elements.pieSubText.length) elements.pieSubText.text((window.i18n && window.i18n.t('parsing_files')) || 'Parsing...');

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
                
                const $uiItem = createUiItem(id, file);
                fragment.appendChild($uiItem[0]); // Append raw DOM
                
                // Placeholder card REMOVED
                // createCarouselCard(id, file);
                
                newJobs.push({ id, file });
            });

            elements.fileList.append(fragment);
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
