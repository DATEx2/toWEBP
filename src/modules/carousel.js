import { state } from './state.js';
import { elements } from './dom.js';
import { downloadBlob } from './utils.js';

let isUserInteracting = false;
let interactTimeout;
let carouselSorted = false; // Track if carousel has been sorted after completion

// openLightbox moved below with order-aware navigation

export function closeLightbox() {
    if (!elements.lightbox.length) return;
    elements.lightbox.removeClass('visible');
    setTimeout(() => elements.lightbox.addClass('hidden'), 300);
}

// Get all completed image IDs sorted by original order
function getOrderedIds() {
    const ids = Array.from(state.completed.keys());
    return ids.sort((a, b) => {
        const orderA = state.originalOrder.get(a) ?? a;
        const orderB = state.originalOrder.get(b) ?? b;
        return orderA - orderB;
    });
}

// Sort carousel cards by original order (call when all done)
export function sortCarouselByOriginalOrder() {
    if (!elements.carouselTrack.length || carouselSorted) return;
    
    const $cards = elements.carouselTrack.find('.carousel-card');
    if (!$cards.length) return;

    // Convert to array to sort
    const cardsArray = $cards.toArray();
    
    // Sort cards by their originalOrder value
    cardsArray.sort((a, b) => {
        const idA = parseInt(a.id.replace('carousel-', ''), 10);
        const idB = parseInt(b.id.replace('carousel-', ''), 10);
        const orderA = state.originalOrder.get(idA) ?? idA;
        const orderB = state.originalOrder.get(idB) ?? idB;
        return orderA - orderB;
    });
    
    // Reappend in sorted order (jQuery append moves elements)
    elements.carouselTrack.append(cardsArray);
    carouselSorted = true;
    console.log('Carousel sorted by original order');
}

// Reset sorted flag when new files are added
export function resetCarouselSortFlag() {
    carouselSorted = false;
}

// Open lightbox by ID (not DOM index)
export function openLightboxById(id) {
    const $card = $(`#carousel-${id}`);
    if (!$card.length) return;
    
    const $img = $card.find('.card-preview');
    const src = $img.attr('src');
    
    if (!src || src.includes('data:image/gif') || src.includes('data:image/svg')) return;
    
    state.currentLightboxId = id;
    
    let highResUrl = src;
    let downloadBlob = null;
    let fileName = 'image';
    
    if (state.completed && state.completed.has(id)) {
        const data = state.completed.get(id);
        if (data.blob) {
            highResUrl = URL.createObjectURL(data.blob);
            downloadBlob = data.blob;
        }
        if (data.fileName) {
            fileName = data.fileName;
        }
    }
    
    elements.lightboxImg.attr('src', highResUrl);
    
    const $nameEl = $card.find('.card-filename');
    if ($nameEl.length && elements.lightboxCaption.length) {
        elements.lightboxCaption.text($nameEl.text());
    }
    
    // Setup download button
    elements.lightboxDownload.off('click').on('click', () => {
        if (downloadBlob) {
            const url = URL.createObjectURL(downloadBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
    });
    
    elements.lightbox.removeClass('hidden');
    requestAnimationFrame(() => elements.lightbox.addClass('visible'));
}

// Legacy function - find by DOM index and convert to ID
export function openLightbox(index) {
    const $images = $('.card-preview');
    if (index < 0 || index >= $images.length) return;
    
    const $img = $images.eq(index);
    const $card = $img.closest('.carousel-card');
    if (!$card.length) return;
    
    const idStr = $card.attr('id').replace('carousel-', '');
    const id = parseInt(idStr, 10);
    openLightboxById(id);
}

export function nextImage() {
    const orderedIds = getOrderedIds();
    const currentIndex = orderedIds.indexOf(state.currentLightboxId);
    if (currentIndex < orderedIds.length - 1) {
        openLightboxById(orderedIds[currentIndex + 1]);
    }
}

export function prevImage() {
    const orderedIds = getOrderedIds();
    const currentIndex = orderedIds.indexOf(state.currentLightboxId);
    if (currentIndex > 0) {
        openLightboxById(orderedIds[currentIndex - 1]);
    }
}

export function createCarouselCard(id, file) {
    if (!elements.carouselTrack.length) return;
    
    // Check if exists
    if ($(`#carousel-${id}`).length) return; 

    const $card = $('<div>', {
        class: 'carousel-card pending',
        id: `carousel-${id}`
    });
    
    const $wrapper = $('<div>', { class: 'card-image-wrapper' });
    
    const $img = $('<img>', {
        class: 'card-preview',
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    });

    // Overlay
    const $overlay = $('<div>', { class: 'card-status-overlay' });
    
    const $icon = $('<div>', {
        class: 'status-icon waiting',
        html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    });

    $overlay.append($icon);
    $wrapper.append($img, $overlay);
    
    const $info = $('<div>', { class: 'card-info' });
    const $filename = $('<div>', { class: 'card-filename' });
    $info.append($filename);
    $card.append($info);
    
    const $acts = $('<div>', { class: 'card-actions' });
    const $dwBtn = $('<button>', {
        class: 'card-download-btn',
        text: (window.i18n && window.i18n.t('download')) || 'DOWNLOAD'
    });
    $acts.append($dwBtn);
    $card.append($acts);
    
    // Close button (Top Right)
    const $closeBtn = $('<button>', {
        class: 'card-close-btn',
        html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6L18 18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        click: () => $card.remove()
    });
    $wrapper.append($closeBtn);

    elements.carouselTrack.append($card);
}

export async function processCarouselBatch() {
    if (state.carouselQueue.length === 0) return;

    // Process multiple items per frame to keep up with workers
    const BATCH_SIZE = 3;
    const batch = state.carouselQueue.splice(0, BATCH_SIZE);

    if (elements.carouselSection.length && elements.carouselSection.hasClass('hidden')) {
        elements.carouselSection.removeClass('hidden');
    }

    const imagesToDecode = [];

    batch.forEach(({ id, data, previewUrl }) => {
        let $card = $(`#carousel-${id}`);

        if (!$card.length) {
            // Should exist if createCarouselCard was called.
            return;
        }

        // Action Update
        // Mark as done
        $card.addClass('done').removeClass('pending');

        // ACTIONS: Clear functionality and replace with Icons
        const $actionsContainer = $card.find('.card-actions');
        if ($actionsContainer.length) {
            $actionsContainer.empty(); // Start fresh

            // 1. Download/Save Button
            const $saveBtn = $('<button>', {
                class: 'card-action-btn',
                title: (window.i18n && window.i18n.t('download')) || 'Download',
                html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
                click: (e) => {
                    e.stopPropagation();
                    downloadBlob(data.blob, data.fileName);
                }
            });
            $actionsContainer.append($saveBtn);

            // 2. Preview/Eye Button
            const $eyeBtn = $('<button>', {
                class: 'card-action-btn',
                title: 'Preview',
                html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
                click: (e) => {
                    e.stopPropagation();
                    // Need to find global index
                    const allPreviews = $('.card-preview');
                    const idx = allPreviews.index($img);
                    openLightbox(idx);
                }
            });
            $actionsContainer.append($eyeBtn);
        }

        // DOM CHEATS: Re-order to keep "Done" on left, "Pending" on right.
        const $allDone = elements.carouselTrack.find('.carousel-card.done');
        //const lastDone = allDone[allDone.length - 1]; 
        
        const $firstPending = elements.carouselTrack.find('.carousel-card.pending').first();
        
        if ($firstPending.length) {
             // Insert before the first pending card
             $card.insertBefore($firstPending);
        } else {
             elements.carouselTrack.append($card);
        }

        const $img = $card.find('.card-preview');
        // Ensure img.src is set.
        if (previewUrl) {
            $img.attr('src', previewUrl);
        }
        $img.css('cursor', 'zoom-in');
        
        $img.on('click', () => {
             const allPreviews = $('.card-preview');
             const idx = allPreviews.index($img);
             openLightbox(idx);
        });

        // imagesToDecode is plain JS array
        imagesToDecode.push($img[0]);

        const $nameEl = $card.find('.card-filename');
        if ($nameEl.length) {
            $nameEl.text(data.fileName);
            $nameEl.attr('title', data.fileName);
        }
        $card.removeClass('pending');
        const $statusIcon = $card.find('.status-icon');
        if ($statusIcon.length) {
            $statusIcon.removeClass('waiting').addClass('success');
            $statusIcon.html(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`);
        }
    });

    await Promise.allSettled(imagesToDecode.map(img => img.decode().catch(e => {})));
}

export function updateCarouselScroll() {
    const $track = elements.carouselTrack;
    const $container = elements.carouselTrackContainer;
    if (!$track.length || !$container.length || state.totalFilesCount === 0) return;

    if (!isUserInteracting) {
        const doneCount = state.completed.size;
        
        // STOP tracking if ALL items are done
        if (state.totalFilesCount > 0 && doneCount === state.totalFilesCount) {
            // Sort carousel cards to original order when fully complete
            sortCarouselByOriginalOrder();
           // Allow scrolling to continue to the end
        }

        const cardWidth = 146; // 130px card + 16px gap (1rem)
        const containerWidth = $container.innerWidth(); // innerWidth preferred in jQuery
        const scrollCenter = containerWidth / 2;
        
        let targetX;
        
        // Initial Phase: Scroll to end while parsing/waiting for first result
        if (doneCount === 0) {
            targetX = $track[0].scrollWidth; // Go to end
        } else {
            // Processing Phase: Keep "head" in center (50% done, 50% pending)
            // Head is at index = doneCount
            targetX = (doneCount * cardWidth) - scrollCenter + (cardWidth / 2);
        }
        
        const trackWidth = $track[0].scrollWidth;
        const maxScroll = trackWidth - containerWidth;
        
        // Clamp
        let clampedTarget = Math.max(0, Math.min(targetX, maxScroll));
        
        const current = $container.scrollLeft();
        const dist = clampedTarget - current;
        
        // Adaptive speed
        if (Math.abs(dist) > 1) {
            let speed = 0.03;
            // If we are lagging by more than 3 cards, speed up significantly
            if (Math.abs(dist) > (cardWidth * 3)) speed = 0.3;
            
            $container.scrollLeft(current + (dist * speed)); 
        }
    }

    // --- Arrow Visibility Logic ---
    if (elements.prevBtn.length && elements.nextBtn.length) {
        const currentScroll = $container.scrollLeft();
        // Use raw DOM for scroll propertires to be accurate
        const scrollWidth = $container[0].scrollWidth;
        const clientWidth = $container[0].clientWidth; // clientWidth excludes borders/scrollbars
        
        const tolerance = 2; // px

        // Hide both if no overflow
        if (scrollWidth <= clientWidth + tolerance) {
            elements.prevBtn.css({ 'opacity': '0', 'pointer-events': 'none' });
            elements.nextBtn.css({ 'opacity': '0', 'pointer-events': 'none' });
        } else {
            // Check Left
            if (currentScroll > tolerance) {
                 elements.prevBtn.css({ 'opacity': '1', 'pointer-events': 'auto' });
            } else {
                 elements.prevBtn.css({ 'opacity': '0', 'pointer-events': 'none' });
            }
            
            // Check Right
            if (currentScroll + clientWidth < scrollWidth - tolerance) {
                 elements.nextBtn.css({ 'opacity': '1', 'pointer-events': 'auto' });
            } else {
                 elements.nextBtn.css({ 'opacity': '0', 'pointer-events': 'none' });
            }
        }
    }
}

export function initCarouselDocs() {
    const $cContainer = elements.carouselTrackContainer;
    
    // Define helpers in scope
    const startInteract = () => {
        isUserInteracting = true;
        clearTimeout(interactTimeout);
    };
    const endInteract = () => {
         clearTimeout(interactTimeout);
         interactTimeout = setTimeout(() => {
             isUserInteracting = false;
         }, 15000); // Wait 15s before resuming auto-scroll to avoid annoying jumps
    };

    if ($cContainer.length) {
        $cContainer.on('mousedown touchstart wheel', startInteract);
        $cContainer.on('mouseup touchend wheel', endInteract);
    }

    if (elements.prevBtn.length) {
        elements.prevBtn.on('click', () => {
            startInteract(); 
            // scrollBy is vanilla.
            const w = $cContainer.innerWidth();
            const cur = $cContainer.scrollLeft();
            // jQuery default animation for smooth scrolling
            $cContainer.animate({ scrollLeft: cur - w }, 300);
            endInteract(); 
        });
    }

    if (elements.nextBtn.length) {
        elements.nextBtn.on('click', () => {
            startInteract(); 
            const w = $cContainer.innerWidth();
            const cur = $cContainer.scrollLeft();
            $cContainer.animate({ scrollLeft: cur + w }, 300);
            endInteract(); 
        });
    }
}
