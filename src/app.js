document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    // Use all available cores except 1 for main thread to maximize speed
    const WORKER_COUNT = Math.max(2, (navigator.hardwareConcurrency || 4) - 1);

    // --- DOM Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const qualityInput = document.getElementById('quality');
    const qualityValue = document.getElementById('quality-value');
    const fileList = document.getElementById('file-list');
    // Sticky Header Elements
    const headerFilesCount = document.querySelector('.header-sticky-stats .files-count-display');
    const headerTotalSaved = document.querySelector('.header-sticky-stats .total-saved-display');
    const headerDownloadBtn = document.getElementById('header-download-btn');
    const headerClearBtn = document.getElementById('header-clear-btn');
    const headerSizeStats = document.getElementById('header-size-stats');
    const formatSelect = document.getElementById('format-select'); // Was also missing

    // Use Sticky Header Elements as primary controls if main ones are missing
    const downloadAllBtn = document.getElementById('download-all') || headerDownloadBtn;
    const clearAllBtn = document.getElementById('clear-all') || headerClearBtn;

    // Stats elements
    const filesCountSpan = document.getElementById('files-count') || headerFilesCount;
    const totalSavedSpan = document.getElementById('total-saved') || headerTotalSaved;


    const template = document.getElementById('file-item-template');
    const pieChart = document.getElementById('pie-chart');
    const progressRing = document.getElementById('progress-ring');
    // const dropInitial = document.getElementById('drop-initial'); // Removed/Unused if we always show ring
    // const dropStats = document.getElementById('drop-stats'); // Always visible now
    const pieMainText = document.getElementById('pie-main-text');
    const pieSubText = document.getElementById('pie-sub-text');
    const pieDefaultContent = document.getElementById('pie-default-content');
    const pieActiveContent = document.getElementById('pie-active-content');
    const progressCircleOuter = document.getElementById('progress-circle-outer');
    const progressCircleInner = document.getElementById('progress-circle-inner');
    const CIRC_OUTER = 729;
    const CIRC_INNER = 678;

    // Initialize Rings to Empty State
    if (progressCircleOuter) progressCircleOuter.style.strokeDashoffset = CIRC_OUTER;
    if (progressCircleInner) progressCircleInner.style.strokeDashoffset = CIRC_INNER;

    // Carousel Elements
    const carouselSection = document.getElementById('carousel-section');
    const carouselTrack = document.getElementById('carousel-track');
    const carouselTrackContainer = document.getElementById('carousel-track-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const carouselTemplate = document.getElementById('carousel-card-template');
    const appContainer = document.querySelector('.app-container');

    // --- State ---
    const state = {
        queue: [],          // Array of file objects waiting to be processed
        processing: new Map(), // Map of active job IDs
        completed: new Map(),  // Map of completed results {id: {blob, fileName, ...}}
        workers: [],        // Array of Worker objects
        workerStatus: [],   // Array of booleans (true = busy)
        carouselQueue: [],
        quality: 80,
        format: 'image/webp', // Default format
        nextId: 1,
        totalFilesCount: 0,
        parsingTarget: 0,
        // Performance & Stats
        totalOriginalSize: 0,
        grandTotalInputSize: 0,
        totalNewSize: 0,
        pendingRowUpdates: [],
        renderDirty: false,
        // Deduplication & Reprocessing
        loadedFiles: [],

        fileSignatures: new Set(),
        lastRunLookup: new Map(),
        lastRunSaved: null,

        parsingCompleteTime: null, // For ring fade delay

        // Visual Interpolation State
        visual: {
            innerProgress: 0,
            innerTarget: 0,
            outerProgress: 0,
            outerTarget: 0
        }
    };

    // --- Initialization ---
    initWorkers();

    updateQualityDisplay();
    initTypewriter();
    initParallax();

    // Initialize i18n with IP-based language detection
    initLanguageSystem();

    // --- Event Listeners ---

    // Scroll Handler (Sticky UI) - Intersection Observer with fixed sentinel
    // The sentinel is positioned absolutely at top:200px and doesn't move with layout changes
    // This toggles the visibility of the sticky progress bar in the header
    const scrollSentinel = document.getElementById('scroll-sentinel');
    
    if (scrollSentinel) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    // When sentinel is NOT visible (scrolled past 200px), add 'scrolled' class
                    if (!entry.isIntersecting) {
                        document.body.classList.add('scrolled');
                    } else {
                        document.body.classList.remove('scrolled');
                    }
                });
            },
            {
                threshold: 0
            }
        );
        
        observer.observe(scrollSentinel);
    }



    // Format Change Listener




    if (formatSelect) {
        // Initialize Tom Select
        // We can just rely on the native change event which Tom Select propagates or fires
        const ts = new TomSelect(formatSelect, {
            controlInput: null, // Disable search/text input
            allowEmptyOption: false
        });

        ts.on('change', (val) => {
            state.format = val;
            localStorage.setItem('towebp_format', val);

            // Trigger reprocessing
            const event = new Event('change');
            qualityInput.dispatchEvent(event);
        });

        // Initialize from specific saved state
        const savedFmt = localStorage.getItem('towebp_format');
        if (savedFmt) {
            state.format = savedFmt;
            ts.setValue(savedFmt, true); // true = silent check (don't fire change initially?) - actually we might want to just set it
        }
    }

    qualityInput.addEventListener('input', (e) => {
        state.quality = parseInt(e.target.value, 10);
        updateQualityDisplay();
    });

    // Handle Quality Change (Reprocess All)
    // Handle Quality Change (Reprocess All - Optimized In-Place)
    qualityInput.addEventListener('change', () => {
        if (!state.loadedFiles || state.loadedFiles.length === 0) return;

        // 1. Build Lookup Map for Smart Diff
        state.lastRunLookup = new Map();
        for (const [id, data] of state.completed) {
            state.lastRunLookup.set(data.fileName, data.newSize);
        }
        state.sessionDiff = 0;

        // 2. Reset System
        state.workers.forEach(w => w.terminate());
        state.workers = [];
        state.workerStatus = [];
        initWorkers();

        state.completed.clear();
        state.processing.clear();
        state.queue = [];
        state.carouselQueue = [];
        state.pendingRowUpdates = [];

        state.totalOriginalSize = 0;
        state.totalNewSize = 0;
        state.totalFilesCount = 0;
        state.parsingTarget = state.loadedFiles.length;

        // 3. Reset UI - Carousel (Preserve Items, Set to Pending)
        // Don't clear carouselTrack.innerHTML
        const cards = carouselTrack.querySelectorAll('.carousel-card');
        cards.forEach(card => {
            card.classList.add('pending');
            // Ensure spinner is visible via CSS, check icon hidden
        });

        if (typeof resetVisuals === 'function') resetVisuals(false);
        state.visual.innerProgress = 0;
        state.visual.innerTarget = 0;
        state.visual.outerProgress = 0;
        state.visual.outerTarget = 0;

        // 4. Update File List IN-PLACE (No Flash, Instant)
        const rows = fileList.children;

        state.loadedFiles.forEach((file, i) => {
            const row = rows[i];
            // Safety check for sync
            if (!row) return;

            // Extract existing ID (file-XXXX)
            const id = row.id.replace('file-', '');

            // Reset Row UI State
            // We DO NOT touch the thumbnail (img.src) -> No flash!

            // Reset Metadata
            const sizeNewEl = row.querySelector('.size-new');
            const badge = row.querySelector('.badge');

            // Reset to "Waiting"
            if (sizeNewEl) {
                sizeNewEl.textContent = 'Waiting...';
                sizeNewEl.className = 'size-new text-muted';
            }
            if (badge) {
                badge.className = 'badge badge-pending';
                badge.textContent = 'Pending';
                badge.classList.remove('hidden');
            }

            row.classList.remove('success', 'error', 'processing');
            // Remove any old diff tooltips or colors

            // Re-Queue
            state.queue.push({ id, file });
            state.totalFilesCount++;
        });

        // Start
        processQueue();
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close Lightbox
            const overlay = document.querySelector('.image-zoom-overlay');
            if (overlay) overlay.remove();
        }
    });

    // --- Global Drag & Drop ---

    // Prevent default browser behavior globally
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop zone when dragging anywhere on the page
    // Prevent default browser behavior (opening files) for all drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Highlight drop zone logic
    let dragCounter = 0;

    ['dragenter', 'dragover'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            if (eventName === 'dragenter') dragCounter++;
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            if (eventName === 'dragleave') dragCounter--;
            if (dragCounter === 0 || eventName === 'drop') {
                dropZone.classList.remove('drag-over');
                dragCounter = 0;
            }
        });
    });

    // Handle Drop
    window.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    // Handle click on dropzone manually
    // No, click is separate.

    dropZone.addEventListener('click', (e) => {
        // Only trigger if clicking the bubble (pie-chart) or its children
        const pie = document.getElementById('pie-chart');
        if (pie && (e.target === pie || pie.contains(e.target))) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = ''; // Reset to allow selecting same files
    });

    if (clearAllBtn || headerClearBtn) {
        const performClear = () => {
            // Clear UI
            fileList.innerHTML = '';
            carouselTrack.innerHTML = '';
            if (statsBar) statsBar.classList.add('hidden'); // Safety check
            carouselSection.classList.add('hidden');

            // Reset State

            // Reset State Variables
            state.completed.clear();
            state.processing.clear();
            state.queue = [];
            state.fileSignatures.clear();
            state.pendingRowUpdates = [];
            state.carouselQueue = [];
            state.totalFilesCount = 0;
            state.totalOriginalSize = 0;
            state.grandTotalInputSize = 0;
            state.totalNewSize = 0;
            state.sessionDiff = 0;

            // Reset Rings / Visuals
            state.visual.innerProgress = 0;
            state.visual.innerTarget = 0;
            state.visual.outerProgress = 0;
            state.visual.outerTarget = 0;

            if (progressCircleOuter) progressCircleOuter.style.strokeDashoffset = CIRC_OUTER;
            if (progressCircleInner) progressCircleInner.style.strokeDashoffset = CIRC_INNER;

            if (pieDefaultContent) pieDefaultContent.classList.remove('hidden');
            if (pieActiveContent) pieActiveContent.classList.add('hidden');

            // Hide Header Stats
            const headerStats = document.querySelector('.header-sticky-stats');
            if (headerStats) headerStats.classList.remove('visible');

            // Reset Header Buttons
            if (headerDownloadBtn) headerDownloadBtn.disabled = true;

            appContainer.classList.remove('expanded');
            updateStats();
        };

        if (clearAllBtn) clearAllBtn.addEventListener('click', performClear);
        if (headerClearBtn) headerClearBtn.addEventListener('click', performClear);

    }

    downloadAllBtn.addEventListener('click', async () => {
        if (state.completed.size === 0) return;

        const zip = new JSZip();
        let count = 0;

        for (const [id, data] of state.completed) {
            zip.file(data.fileName, data.blob);
            count++;
        }

        if (count > 0) {
            downloadAllBtn.textContent = 'Zipping...'; // Will be handled by translating dynamically if needed, or just leave as is for now
            const content = await zip.generateAsync({ type: "blob" });
            downloadBlob(content, "converted_images.zip");
            downloadAllBtn.textContent = i18n.t('download_zip');
        }
    });

    // Carousel Navigation
    prevBtn.addEventListener('click', () => {
        carouselTrackContainer.scrollBy({ left: -200, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        carouselTrackContainer.scrollBy({ left: 200, behavior: 'smooth' });
    });

    // Carousel Momentum Scroll
    let scrollVelocity = 0;
    let isScrolling = false;
    let scrollRafId = null;

    function momentumLoop() {
        if (Math.abs(scrollVelocity) > 0.5) {
            carouselTrackContainer.scrollLeft += scrollVelocity;
            scrollVelocity *= 0.92; // Friction
            scrollRafId = requestAnimationFrame(momentumLoop);
        } else {
            isScrolling = false;
            scrollVelocity = 0;
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
        }
    }

    carouselTrackContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            // Accumulate velocity
            scrollVelocity += e.deltaY * 0.5;

            // Clamp velocity
            const maxV = 60;
            if (scrollVelocity > maxV) scrollVelocity = maxV;
            if (scrollVelocity < -maxV) scrollVelocity = -maxV;

            if (!isScrolling) {
                isScrolling = true;
            }
        }
    }, { passive: false });

    // --- Keyboard Navigation for Carousel ---
    // --- Lightbox & Keyboard Navigation ---
    let currentLightboxIndex = -1;

    function openLightbox(index) {
        const images = document.querySelectorAll('.card-preview');
        if (index < 0 || index >= images.length) return;
        
        currentLightboxIndex = index;
        const img = images[index];
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');
        const caption = document.getElementById('lightbox-caption');

        lightboxImg.src = img.src;
        
        // Try to get filename
        const card = img.closest('.carousel-card');
        if (card) {
            const nameEl = card.querySelector('.card-filename');
            if (nameEl && caption) caption.textContent = nameEl.textContent;
        }

        lightbox.classList.remove('hidden');
        // Small delay to allow display:flex to apply before transition
        requestAnimationFrame(() => lightbox.classList.add('visible'));
    }

    function closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.remove('visible');
        setTimeout(() => lightbox.classList.add('hidden'), 300);
    }

    function nextImage() {
        const images = document.querySelectorAll('.card-preview');
        if (currentLightboxIndex < images.length - 1) {
            openLightbox(currentLightboxIndex + 1);
        }
    }

    function prevImage() {
        if (currentLightboxIndex > 0) {
            openLightbox(currentLightboxIndex - 1);
        }
    }

    // Lightbox Controls Events
    const lbClose = document.getElementById('lightbox-close');
    const lbNext = document.getElementById('lightbox-next');
    const lbPrev = document.getElementById('lightbox-prev');
    const lbOverlay = document.getElementById('lightbox');

    if (lbClose) lbClose.onclick = closeLightbox;
    if (lbNext) lbNext.onclick = (e) => { e.stopPropagation(); nextImage(); };
    if (lbPrev) lbPrev.onclick = (e) => { e.stopPropagation(); prevImage(); };
    if (lbOverlay) lbOverlay.onclick = (e) => {
        if (e.target === lbOverlay) closeLightbox();
    };

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const lightbox = document.getElementById('lightbox');
        const isLightboxOpen = lightbox && !lightbox.classList.contains('hidden');

        if (isLightboxOpen) {
             if (e.key === 'ArrowRight') nextImage();
             else if (e.key === 'ArrowLeft') prevImage();
             else if (e.key === 'Escape') closeLightbox();
             return;
        }

        // Carousel Scroll
        const carousel = document.getElementById('carousel-track');
        if (!carousel) return;
        const scrollAmount = 300; 

        if (e.key === 'ArrowRight') {
            carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        } else if (e.key === 'ArrowLeft') {
            carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
    });

    // --- File Detection & Typewriter Effect ---

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

        if (!files.length) return;


        downloadAllBtn.disabled = true; // Disable until first file completes
        appContainer.classList.add('expanded');

        const rawFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (rawFiles.length === 0) return;

        // Deduplicate
        const fileArray = [];
        rawFiles.forEach(f => {
            const sig = `${f.name}-${f.size}-${f.lastModified}`;
            if (!state.fileSignatures.has(sig)) {
                state.fileSignatures.add(sig);
                fileArray.push(f);
            }
        });

        if (fileArray.length === 0) return;

        // Calculate Total Input Size for Display (Pre-calculation)
        const batchSize = fileArray.reduce((acc, f) => acc + f.size, 0);
        state.grandTotalInputSize = (state.grandTotalInputSize || 0) + batchSize;

        // Archive for reprocessing
        state.loadedFiles.push(...fileArray);

        // Ensure Stats View is visible
        const dropInitial = document.getElementById('drop-initial');
        const dropStats = document.getElementById('drop-stats');
        if (dropInitial) dropInitial.classList.add('hidden');
        if (dropStats) dropStats.classList.remove('hidden');

        // Show Active Pie Content
        if (pieDefaultContent) pieDefaultContent.classList.add('hidden');
        if (pieActiveContent) pieActiveContent.classList.remove('hidden');

        // Reset counts for parsing phase
        state.parsingTarget += fileArray.length;
        // Parsing phase uses totalFilesCount to track "already parsed"

        // Immediate update to show count and "Parsing..." or "Processing..."
        if (pieMainText) pieMainText.textContent = i18n.t('processing');
        if (pieSubText) pieSubText.textContent = i18n.t('parsing_files');

        if (typeof updateStats === 'function') updateStats(); // This might overwrite it? Checked below.

        let index = 0;
        const CHUNK_SIZE = 50; // Process more files per frame for faster initial feedback

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
            // Update DOM and State in one go for this chunk
            fileList.appendChild(fragment);
            state.queue.push(...newJobs);

            // Increment known total files as we parse them
            state.totalFilesCount += chunk.length;

            // Start processing this chunk immediately
            processQueue();

            // Trigger Visual Update
            state.renderDirty = true;

            index += CHUNK_SIZE;

            if (index < fileArray.length) {
                // Schedule next chunk
                requestAnimationFrame(processChunk);
            } else {
                // Done parsing
                state.renderDirty = true;
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

        // Lightbox Zoom (Whole Row)
        el.style.cursor = 'zoom-in';
        el.onclick = (e) => {
            // Ignore if clicking buttons (like download)
            if (e.target.closest('button') || e.target.closest('a')) return;

            const overlay = document.createElement('div');
            overlay.className = 'image-zoom-overlay';
            const largeImg = document.createElement('img');
            largeImg.src = url;
            overlay.appendChild(largeImg);
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        };

        // Status
        el.classList.add('converting');
        el.querySelector('.badge').textContent = i18n.t('waiting');

        return el;
    }

    // --- Loop ---

    // Main loop for UI updates (High Performance 60-165Hz)
    function renderLoop() {
        if (state.renderDirty) {
            updateVisuals();
            state.renderDirty = false;
        }
        drawRings(); // Interpolate and Draw Rings every frame
        processCarouselBatch();
        requestAnimationFrame(renderLoop);
    }

    function updateStats() {
        if (!state.parsingTarget) return;

        const savedTotal = (state.totalOriginalSize - state.totalNewSize);
        const savedStr = formatSize(savedTotal);

        // Clean simplified text
        let html = `${i18n.t('total_saved_prefix')} ${savedStr}`;

        // Only update pieSubText if we have actual savings.
        if (state.totalNewSize > 0 && savedTotal > 0 && pieSubText) {
            pieSubText.innerHTML = html;
        } else if (pieSubText) {
            pieSubText.innerHTML = '';
        }

        if (pieMainText) {
            // Check if we have files to process
            const hasFiles = state.grandTotalInputSize > 0;

            if (hasFiles) {
                // Format: "10 MB / 15 GB" (Processed Input / Total Input)
                // Use totalOriginalSize as 'Processed Input' (since it sums up as we finish files)
                const processedInput = state.totalOriginalSize;
                const totalInput = state.grandTotalInputSize;
                const totalNew = state.totalNewSize;

                const isDone = state.completed.size === state.totalFilesCount && state.totalFilesCount > 0 && state.queue.length === 0;

                if (isDone) {
                    pieMainText.textContent = `${formatSize(processedInput)} → ${formatSize(totalNew)}`;
                    if (pieSubText) {
                        const savedTotal = processedInput - totalNew;
                        const savedPercent = Math.round((savedTotal / processedInput) * 100);
                        pieSubText.innerHTML = `<span style="color: var(--success); font-weight: 700;">-${savedPercent}%</span> (${formatSize(savedTotal)} ${i18n.t('saved')})`;
                    }
                } else {
                    pieMainText.textContent = `${formatSize(processedInput)} / ${formatSize(totalInput)}`;
                }

                // If processing but no files finished yet, this will show "0 B / 15 MB" which is correct.
            } else {
                pieMainText.textContent = i18n.t('processing');
            }

            // Saved text + Diff logic
            if (state.totalNewSize > 0 && savedTotal > 0) {
                let subHtml = `${i18n.t('total_saved_prefix')} ${savedStr}`;

                // Add diff if enabled and exists
                if (state.lastRunLookup && state.lastRunLookup.size > 0) {
                    const diffSize = state.sessionDiff || 0;
                    if (diffSize !== 0) {
                        const diffStr = formatSize(diffSize);
                        const sign = diffSize > 0 ? '+' : '';
                        const colorClass = diffSize < 0 ? 'diff-better' : 'diff-worse';
                        subHtml += ` <span class="${colorClass}">(${sign}${diffStr})</span>`;
                    }
                }

                if (pieSubText) pieSubText.innerHTML = subHtml;
            } else {
                // If actively processing but 0 saved (e.g. first file not done), show generic 'Starting...'
                if (state.queue.length > 0 && pieSubText) {
                     pieSubText.innerHTML = i18n.t('starting');
                } else if (pieSubText) {
                     pieSubText.innerHTML = '';
                }
            }
        }
    }

    // Smooth Animation System
    function drawRings() {
        updateStats();

        // LERP Factor (Lower = Smoother/Slower, Higher = Snappier)
        const LERP = 0.05;

        // 1. Inner Ring (Yellow)
        const dInner = state.visual.innerTarget - state.visual.innerProgress;
        if (Math.abs(dInner) > 0.0001) {
            state.visual.innerProgress += dInner * LERP;
        } else {
            state.visual.innerProgress = state.visual.innerTarget;
        }

        // 2. Outer Ring (Green)
        const dOuter = state.visual.outerTarget - state.visual.outerProgress;
        if (Math.abs(dOuter) > 0.0001) {
            state.visual.outerProgress += dOuter * LERP;
        } else {
            state.visual.outerProgress = state.visual.outerTarget;
        }

        // Apply to DOM
        if (progressCircleInner) {
            const offset = CIRC_INNER - (state.visual.innerProgress * CIRC_INNER);
            progressCircleInner.style.strokeDashoffset = offset;
        }
        if (progressCircleOuter) {
            const offset = CIRC_OUTER - (state.visual.outerProgress * CIRC_OUTER);
            progressCircleOuter.style.strokeDashoffset = offset;
        }

        // Update Sticky Bar (Multi-Layer)
        const stickyParsing = document.getElementById('sticky-bar-parsing');
        const stickyConversion = document.getElementById('sticky-bar-conversion');
        const stickySaved = document.getElementById('sticky-bar-saved');

        if (stickyParsing) {
            stickyParsing.style.width = (state.visual.innerProgress * 100) + '%';
        }
        if (stickyConversion) {
            stickyConversion.style.width = (state.visual.outerProgress * 100) + '%';
        }
        if (stickySaved) {
            // Visualizing SAVED ratio (Green = Saved)
            // If we saved 90%, the bar is 90% full solid green.
            let savedRatio = 0;
            if (state.totalOriginalSize > 0) {
                const saved = state.totalOriginalSize - state.totalNewSize;
                savedRatio = saved / state.totalOriginalSize;
            }
            stickySaved.style.transform = `scaleY(${savedRatio})`;
        }
    }

    // Start Loops
    requestAnimationFrame(renderLoop);

    function initTypewriter() {
        const h2 = document.querySelector('.hero-section h2');
        const p = document.querySelector('.hero-section p');

        if (!h2 || !p) return;

        // Hide other elements initially (Drop zone, Info)
        const finalRevealElements = document.querySelectorAll('.drop-zone, .info-section');

        // Ensure initial hidden state
        p.style.opacity = '1'; // We handle P visibility by clearing text
        finalRevealElements.forEach(e => {
            e.style.opacity = '0';
            e.style.transition = 'opacity 0.8s ease-out';
        });


        const textH2 = h2.textContent;
        const textP = p.textContent;

        h2.textContent = '';
        p.textContent = '';

        h2.classList.add('typewriter-cursor');

        // Ultra fast typing helper
        // Helper returns Promise
        function typeLinePromise(element, text) {
            return new Promise(resolve => {
                let i = 0;
                function type() {
                    if (i < text.length) {
                        element.textContent += text.charAt(i);
                        i++;

                        if (text.charAt(i - 1) === ' ') {
                            setTimeout(type, 15);
                        } else {
                            setTimeout(type, Math.random() * 3 + 2);
                        }
                    } else {
                        resolve();
                    }
                }
                type();
            });
        }

        // Start Chain - Parallel Typing
        setTimeout(() => {
            // Add cursors to both
            h2.classList.add('typewriter-cursor');
            p.classList.add('typewriter-cursor');

            const dropZone = document.querySelector('.drop-zone');
            if (dropZone) dropZone.style.opacity = '1';
            setTimeout(t => {
                const infoSection = document.querySelector('.info-section');
                if (infoSection) {
                    infoSection.style.opacity = '1';
                    startInfoCardsTyping();
                }
            }, 1000);
            Promise.all([
                typeLinePromise(h2, textH2).then(() => h2.classList.remove('typewriter-cursor')),
                typeLinePromise(p, textP).then(() => p.classList.remove('typewriter-cursor'))
            ]).then(() => {
                // Determine which elements to reveal

            });
        }, 5);


        function startInfoCardsTyping() {
            const cards = document.querySelectorAll('.info-card');
            cards.forEach((card, index) => {
                setTimeout(() => {
                    const h3 = card.querySelector('h3');
                    const p = card.querySelector('p');

                    if (!h3 || !p) return;

                    const h3Text = h3.textContent;
                    const pText = p.textContent;

                    h3.textContent = '';
                    p.textContent = '';
                    h3.style.visibility = 'visible';
                    p.style.visibility = 'visible';

                    // Parallel typing for card content
                    typeLinePromise(h3, h3Text).then(() => {
                        typeLinePromise(p, pText);
                    });
                }, index * 400); // Stagger cards slightly
            });
        }
    }

    function initParallax() {
        let ticking = false;
        document.addEventListener('mousemove', (e) => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const x = (e.clientX / window.innerWidth - 0.5) * 2; // -1 to 1
                    const y = (e.clientY / window.innerHeight - 0.5) * 2;
                    
                    const blobs = document.querySelectorAll('.blob');
                    blobs.forEach((blob, index) => {
                        // Reverse direction for depth feel, different speeds
                        const speed = (index + 1) * 30; 
                        const xOffset = x * speed * (index % 2 === 0 ? 1 : -1);
                        const yOffset = y * speed * (index % 2 === 0 ? 1 : -1);
                        
                        blob.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
                    });
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    async function processCarouselBatch() {
        if (state.carouselQueue.length === 0) return;

        // Take all current items
        const batch = [...state.carouselQueue];
        state.carouselQueue = []; // Clear queue

        if (carouselSection.classList.contains('hidden')) {
            carouselSection.classList.remove('hidden');
        }

        const imagesToDecode = [];

        batch.forEach(({ id, data, previewUrl }) => {
            // Check if card exists (Reprocessing case)
            let card = document.getElementById(`carousel-file-${id}`); // Changed ID format in handleFiles needed? 
            // Wait, standard IDs are `carousel-${id}`.

            let isNew = false;
            card = document.getElementById(`carousel-${id}`);

            if (!card) {
                // Create New
                const clone = carouselTemplate.content.cloneNode(true);
                card = clone.querySelector('.carousel-card');
                card.id = `carousel-${id}`;
                isNew = true;

                // Close Action
                const closeBtn = card.querySelector('.card-close-btn');
                closeBtn.onclick = () => card.remove();

                // Download Action
                const dwBtn = card.querySelector('.card-download-btn');
                dwBtn.onclick = () => downloadBlob(data.blob, data.fileName);
            } else {
                // Update Existing Actions (Blob might have changed)
                const dwBtn = card.querySelector('.card-download-btn');
                dwBtn.onclick = () => downloadBlob(data.blob, data.fileName);
            }

            // Set Image
            const img = card.querySelector('.card-preview');
            img.src = previewUrl;
            img.style.cursor = 'zoom-in';
            
            img.onclick = () => {
                const all = Array.from(document.querySelectorAll('.card-preview'));
                openLightbox(all.indexOf(img));
            };

            imagesToDecode.push(img);

            // Set Filename
            card.querySelector('.card-filename').textContent = data.fileName;
            card.querySelector('.card-filename').title = data.fileName;

            // Remove Pending State (if recycling or just created)
            card.classList.remove('pending');

            if (isNew) {
                carouselTrack.appendChild(card);
            }
        });

        // Wait for all images in this batch to decode to avoid white flashes
        await Promise.allSettled(imagesToDecode.map(img => img.decode().catch(e => { })));

        // Scroll to end ONLY if we added new items (not just updating)
        // Actually, user requested "scroll automat cand sunt done".
        // If we just updated, maybe we don't need to scroll unless it was pending?
        // Let's keep smooth scroll to end for now as it signals progress.
        // Or better: Only scroll if the user isn't actively interacting? 
        // For now, respect "scroll automat cand sunt done".

        // Logic: If batch had items, scroll to show them.
        carouselTrackContainer.scrollTo({
            left: carouselTrackContainer.scrollWidth,
            behavior: 'smooth'
        });
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
                quality: state.quality,
                format: state.format
            });

            // Try to assign more if we have multiple idle workers
            processQueue();
        }
    }

    function handleWorkerMessage(workerIndex) {
        return (e) => {
            const { id, success, blob, thumbnail, originalSize, newSize, error } = e.data;

            // Mark worker as idle
            state.workerStatus[workerIndex] = false;

            // Retrieve job data (Pure Data)
            // Retrieve job data (Pure Data)
            const job = state.processing.get(id);
            // We use job.file.name to avoid touching DOM for read
            const originalName = job ? job.file.name : `image_${id}`;
            const extMap = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/webp': '.webp',
                'image/avif': '.avif'
            };
            const ext = extMap[state.format] || '.webp';
            const newName = originalName.replace(/\.[^/.]+$/, "") + ext;

            if (success) {
                // Sanitize input numbers to prevent NaN
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

                // Update Cache Stats (Safe addition)
                state.totalOriginalSize = (state.totalOriginalSize || 0) + oSize;
                state.totalNewSize = (state.totalNewSize || 0) + nSize;



                // Smart Diff Logic (Incremental)
                if (state.lastRunLookup && state.lastRunLookup.has(newName)) {
                    const oldNewSize = state.lastRunLookup.get(newName);
                    // Diff = CurrentSize - PreviousSize
                    // If Current is 40, Prev was 50, Diff is -10 (Blue/Good).
                    const fileDiff = nSize - oldNewSize;
                    state.sessionDiff = (state.sessionDiff || 0) + fileDiff;
                }

                // Add to Carousel Queue (Pure Data)
                state.carouselQueue.push({ id, data: resultData, previewUrl: thumbnail });

                // Queue DOM Update (Batching)
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
                // Queue Error Update
                state.pendingRowUpdates.push({
                    id,
                    success: false,
                    error
                });
            }

            state.processing.delete(id);
            state.renderDirty = true; // Request a global visual update

            // Process next
            processQueue();
        };
    }

    function updateVisuals() {
        // 1. Flush Row Updates (Time Sliced Batching)
        // Limit updates to 20 per frame to guarantee 60-165fps
        // Even if 1000 files finish, visual updates will stream in over a few frames.
        // Limit updates to 100 per frame for faster visual feedback
        const BATCH_LIMIT = 100;

        if (state.pendingRowUpdates.length > 0) {
            const updates = state.pendingRowUpdates.splice(0, BATCH_LIMIT);

            for (const update of updates) {
                const row = document.getElementById(`file-${update.id}`);
                if (!row) continue;

                row.classList.remove('converting');

                if (update.success) {
                    // Update size format: "12.3MB -> 351.6KB"
                    // We clear specific size-new styling if needed or just append
                    row.querySelector('.size-new').innerHTML = ` <span style="opacity:0.6">&rarr;</span> ${formatSize(update.newSize)}`;
                    // Ensure size-old is visible (it is set on creation)

                    const badge = row.querySelector('.badge');
                    badge.textContent = `-${update.savedPercent}%`;
                    badge.classList.add('success');

                    // Binding click handler (cheap)
                    const dlBtn = row.querySelector('.download-btn');
                    dlBtn.disabled = false;
                    dlBtn.onclick = () => downloadBlob(update.blob, update.newName);
                } else {
                    row.querySelector('.badge').textContent = 'Error';
                }
            }

            // If more updates remain, ensure we render next frame
            if (state.pendingRowUpdates.length > 0) {
                state.renderDirty = true;
            }
        }

        // 2. Global Stats Updates
        const count = state.completed.size;
        filesCountSpan.textContent = `${count} file${count !== 1 ? 's' : ''} converted`;

        // Enable Download All if we have distinct results
        if (count > 0) {
            downloadAllBtn.disabled = false;
        } else {
            downloadAllBtn.disabled = true;
        }

        // Use Cached Totals
        const originalTotal = state.totalOriginalSize;
        const newTotal = state.totalNewSize;

        const savedTotal = originalTotal - newTotal;
        const savedText = savedTotal > 0 ? `Saved ${formatSize(savedTotal)}` : '';
        totalSavedSpan.textContent = savedText;
        totalSavedSpan.style.display = savedTotal > 0 ? 'inline' : 'none';

        // Update Sticky Header Stats
        if (headerFilesCount) headerFilesCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
        if (headerTotalSaved) headerTotalSaved.textContent = savedText;
        if (headerSizeStats) headerSizeStats.textContent = `${formatSize(newTotal)} / ${formatSize(originalTotal)}`;
        if (headerDownloadBtn) headerDownloadBtn.disabled = downloadAllBtn.disabled;

        // Show header stats via class if we have content
        // Show header stats via class if we are TOTALLY DONE
        const headerStats = document.querySelector('.header-sticky-stats');
        if (headerStats) {
            const isDone = state.completed.size > 0 && state.queue.length === 0 && state.processing.size === 0;
            if (isDone) {
                headerStats.classList.add('visible');
            } else {
                headerStats.classList.remove('visible');
            }
        }

        // Update Progress Ring Targets (Logic Only)

        const isParsing = state.totalFilesCount < state.parsingTarget;

        // Phase 1: Parsing (Yellow Inner Ring)
        if (isParsing) {
            // Inner Ring Progress
            if (state.parsingTarget > 0) {
                const progress = state.totalFilesCount / state.parsingTarget;
                // Set Target for LERP
                state.visual.innerTarget = progress;

                // Ensure opacity is 1
                if (progressCircleInner) progressCircleInner.style.opacity = '1';

                // Outer Ring Concurrent Target
                const procProgress = count / state.parsingTarget;
                state.visual.outerTarget = procProgress; // Use same denominator for sync

                // Text
                // Text handling moved to updateStats()

            }
        }
        // Phase 2: Converting (Green Outer Ring)
        else if (state.totalFilesCount > 0) {
            // Inner Ring Full (Parsing Complete) -> Fade Out with Delay
            state.visual.innerTarget = 1;

            if (!state.parsingCompleteTime) {
                state.parsingCompleteTime = Date.now();
            }

            if (progressCircleInner) {
                // Determine if we should hide parsing ring (yellow)
                // Parsing is done when totalFilesCount matches parsingTarget
                const isParsingDone = state.totalFilesCount >= state.parsingTarget && state.parsingTarget > 0;
                
                if (isParsingDone) {
                    // Start fading out shortly after parsing is complete to give visual feedback
                    if (!state.parsingCompleteTime) state.parsingCompleteTime = Date.now();
                    
                    if (Date.now() - state.parsingCompleteTime > 300) {
                         progressCircleInner.style.opacity = '0';
                         progressCircleInner.style.visibility = 'hidden';
                    }
                } else {
                    progressCircleInner.style.opacity = '1';
                    progressCircleInner.style.visibility = 'visible';
                }
            }

            // Outer Ring Progress
            const progress = count / state.totalFilesCount;
            state.visual.outerTarget = progress;

            // Text Update: "1 / 107"
            // Text Update handled by updateStats


            if (count === state.totalFilesCount && count > 0) {
                // Done logic handled in updateStats
            } else {
                // Processing logic handled in updateStats
            }

            // Inner Pie - Saved %
            if (originalTotal > 0) {
                const compressedPercent = (newTotal / originalTotal) * 100;
                const deg = (compressedPercent / 100) * 360;
                pieChart.style.setProperty('--p', `${deg}deg`);
            }

        } else {
            // Ready State
            state.visual.innerTarget = 0;
            state.visual.outerTarget = 0;

            // Show Default Content
            if (pieDefaultContent) pieDefaultContent.classList.remove('hidden');
            if (pieActiveContent) pieActiveContent.classList.add('hidden');
        }
    }

    // --- Helpers ---

    function formatSize(bytes) {
        if (typeof bytes !== 'number' || isNaN(bytes)) return '0 B';
        if (bytes === 0) return '0 B';

        const isNegative = bytes < 0;
        const absBytes = Math.abs(bytes);

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(absBytes) / Math.log(k));

        // Safety bound check
        let val, unit;
        if (i < 0) {
            val = absBytes;
            unit = 'B';
        } else if (i >= sizes.length) {
            const last = sizes.length - 1;
            val = parseFloat((absBytes / Math.pow(k, last)).toFixed(1));
            unit = sizes[last];
        } else {
            val = parseFloat((absBytes / Math.pow(k, i)).toFixed(1));
            unit = sizes[i];
        }

        return (isNegative ? '-' : '') + val + ' ' + unit;
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

    // --- Language System ---
    async function initLanguageSystem() {
        const langBurger = document.getElementById('lang-burger');
        const langMenu = document.getElementById('lang-menu');
        const langOptions = document.querySelectorAll('.lang-option');

        // Detect language with priority: localStorage > IP > browser > default
        let detectedLang = await detectLanguage();
        
        // Apply language
        if (window.i18n) {
            window.i18n.apply(detectedLang);
        }

        // Mark active language
        updateActiveLang(detectedLang);

        // Burger menu toggle
        langBurger?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent document click from closing it immediately
            langMenu.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (langMenu && !langMenu.classList.contains('hidden')) {
                // If click is outside the menu and not on the burger
                if (!langMenu.contains(e.target) && !langBurger.contains(e.target)) {
                    langMenu.classList.add('hidden');
                }
            }
        });

        // Language selection
        langOptions.forEach(option => {
            option.addEventListener('click', () => {
                const lang = option.dataset.lang;
                if (window.i18n) {
                    window.i18n.apply(lang);
                }
                // Save to localStorage
                localStorage.setItem('towebp_language', lang);
                updateActiveLang(lang);
                langMenu.classList.add('hidden'); // Close after selection
            });
        });

        function updateActiveLang(lang) {
            langOptions.forEach(opt => {
                if (opt.dataset.lang === lang) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
    }

    async function detectLanguage() {
        // 1. Check localStorage first
        const savedLang = localStorage.getItem('towebp_language');
        if (savedLang && window.translations && window.translations[savedLang]) {
            return savedLang;
        }

        // 2. Try IP-based detection
        try {
            const response = await fetch('https://ipapi.co/json/', { 
                signal: AbortSignal.timeout(3000) 
            });
            const data = await response.json();
            const countryCode = data.country_code?.toLowerCase();
            
            // Map country codes to languages
            const countryToLang = {
                'ro': 'ro', 'md': 'ro',
                'fr': 'fr', 'be': 'fr', 'ch': 'fr',
                'de': 'de', 'at': 'de',
                'es': 'es', 'mx': 'es', 'ar': 'es', 'co': 'es',
                'it': 'it',
                'pt': 'pt', 'br': 'pt',
                'nl': 'nl',
                'gr': 'el',
                'hu': 'hu',
                'pl': 'pl',
                'sa': 'ar', 'ae': 'ar', 'eg': 'ar',
                'bg': 'bg',
                'jp': 'ja',
                'cn': 'zh', 'tw': 'zh'
            };

            const detectedLang = countryToLang[countryCode];
            if (detectedLang && window.translations && window.translations[detectedLang]) {
                return detectedLang;
            }
        } catch (error) {
            console.log('IP detection failed, using browser language');
        }

        // 3. Fall back to browser language
        if (window.i18n) {
            const browserLang = window.i18n.getLang();
            if (window.translations && window.translations[browserLang]) {
                return browserLang;
            }
        }

        // 4. Default to English
        return 'en';
    }

});
