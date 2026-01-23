import { state } from './state.js';
import { elements } from './dom.js';
import { downloadBlob } from './utils.js';

let isUserInteracting = false;
let interactTimeout;
let carouselSorted = false; // Track if carousel has been sorted after completion

// openLightbox moved below with order-aware navigation

export function closeLightbox() {
    if (!elements.lightbox) return;
    elements.lightbox.classList.remove('visible');
    setTimeout(() => elements.lightbox.classList.add('hidden'), 300);
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
    if (!elements.carouselTrack || carouselSorted) return;
    
    const cards = Array.from(elements.carouselTrack.querySelectorAll('.carousel-card'));
    if (cards.length === 0) return;
    
    // Sort cards by their originalOrder value
    cards.sort((a, b) => {
        const idA = parseInt(a.id.replace('carousel-', ''), 10);
        const idB = parseInt(b.id.replace('carousel-', ''), 10);
        const orderA = state.originalOrder.get(idA) ?? idA;
        const orderB = state.originalOrder.get(idB) ?? idB;
        return orderA - orderB;
    });
    
    // Reappend in sorted order
    cards.forEach(card => elements.carouselTrack.appendChild(card));
    carouselSorted = true;
    console.log('Carousel sorted by original order');
}

// Reset sorted flag when new files are added
export function resetCarouselSortFlag() {
    carouselSorted = false;
}

// Open lightbox by ID (not DOM index)
export function openLightboxById(id) {
    const card = document.getElementById(`carousel-${id}`);
    if (!card) return;
    
    const img = card.querySelector('.card-preview');
    if (!img || !img.src || img.src.includes('data:image/gif') || img.src.includes('data:image/svg')) return;
    
    state.currentLightboxId = id;
    
    let highResUrl = img.src;
    if (state.completed && state.completed.has(id)) {
        const data = state.completed.get(id);
        if (data.blob) {
            highResUrl = URL.createObjectURL(data.blob);
        }
    }
    
    elements.lightboxImg.src = highResUrl;
    
    const nameEl = card.querySelector('.card-filename');
    if (nameEl && elements.lightboxCaption) {
        elements.lightboxCaption.textContent = nameEl.textContent;
    }
    
    elements.lightbox.classList.remove('hidden');
    requestAnimationFrame(() => elements.lightbox.classList.add('visible'));
}

// Legacy function - find by DOM index and convert to ID
export function openLightbox(index) {
    const images = document.querySelectorAll('.card-preview');
    if (index < 0 || index >= images.length) return;
    
    const img = images[index];
    const card = img.closest('.carousel-card');
    if (!card) return;
    
    const idStr = card.id.replace('carousel-', '');
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
    if (!elements.carouselTrack) return;
    
    // Check if exists
    if (document.getElementById(`carousel-${id}`)) return; 

    const card = document.createElement('div');
    card.className = 'carousel-card pending';
    card.id = `carousel-${id}`; 
    
    const wrapper = document.createElement('div');
    wrapper.className = 'card-image-wrapper';
    
    const img = document.createElement('img');
    img.className = 'card-preview';
    // No src initially - showing background of wrapper or pending state
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // Placeholder transparent GIF

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'card-status-overlay';
    
    const icon = document.createElement('div');
    icon.className = 'status-icon waiting';
    // Spinner or clock icon for pending
    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    overlay.appendChild(icon);
    wrapper.appendChild(img);
    wrapper.appendChild(overlay);
    
    const info = document.createElement('div');
    info.className = 'card-info';
    const filename = document.createElement('div');
    filename.className = 'card-filename';
    info.appendChild(filename);
    card.appendChild(info);
    
    const acts = document.createElement('div');
    acts.className = 'card-actions';
    const dwBtn = document.createElement('button');
    dwBtn.className = 'card-download-btn';
    dwBtn.textContent = (window.i18n && window.i18n.t('download')) || 'DOWNLOAD';
    acts.appendChild(dwBtn);
    card.appendChild(acts);
    
    // Close button (Top Right)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'card-close-btn';
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6L18 18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    closeBtn.onclick = () => card.remove();
    wrapper.appendChild(closeBtn);

    elements.carouselTrack.appendChild(card);
}

export async function processCarouselBatch() {
    if (state.carouselQueue.length === 0) return;

    // Process multiple items per frame to keep up with workers
    const BATCH_SIZE = 3;
    const batch = state.carouselQueue.splice(0, BATCH_SIZE);

    if (elements.carouselSection && elements.carouselSection.classList.contains('hidden')) {
        elements.carouselSection.classList.remove('hidden');
    }

    const imagesToDecode = [];

    batch.forEach(({ id, data, previewUrl }) => {
        let card = document.getElementById(`carousel-${id}`);

        if (!card) {
            // Should exist if createCarouselCard was called.
            // But if we missed it, assume it's an error or async race.
            // We can't easily create it now without 'file' object.
            // Assuming it exists from parsing stage.
            return;
        }

        // Action Update
        // Mark as done
        card.classList.add('done');
        card.classList.remove('pending');

        // ACTIONS: Clear functionality and replace with Icons
        const actionsContainer = card.querySelector('.card-actions');
        if (actionsContainer) {
            actionsContainer.innerHTML = ''; // Start fresh

            // 1. Download/Save Button
            const saveBtn = document.createElement('button');
            saveBtn.className = 'card-action-btn';
            saveBtn.title = (window.i18n && window.i18n.t('download')) || 'Download';
            saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
            saveBtn.onclick = (e) => {
                e.stopPropagation();
                downloadBlob(data.blob, data.fileName);
            };
            actionsContainer.appendChild(saveBtn);

            // 2. Preview/Eye Button
            const eyeBtn = document.createElement('button');
            eyeBtn.className = 'card-action-btn';
            eyeBtn.title = 'Preview';
            eyeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
            eyeBtn.onclick = (e) => {
                e.stopPropagation();
                openLightbox(Array.from(document.querySelectorAll('.card-preview')).indexOf(img));
            };
            actionsContainer.appendChild(eyeBtn);
        }

        // DOM CHEATS: Re-order to keep "Done" on left, "Pending" on right.
        // Find the last .done card that isn't this one.
        const allDone = Array.from(elements.carouselTrack.querySelectorAll('.carousel-card.done'));
        const lastDone = allDone[allDone.length - 1]; // Could be this card if already marked?
        
        // If we just marked it done, it is in 'allDone'.
        // We want to move 'card' to be after the LAST done card (which might be itself if we don't handle carefully, 
        // but moving it to end of done pile is safe).
        // Actually, if we just appended it to the 'done group', it essentially means 
        // ensuring it comes after all other done cards, but BEFORE any pending cards.
        
        // Let's grab all pending cards.
        const firstPending = elements.carouselTrack.querySelector('.carousel-card.pending');
        
        if (firstPending) {
             // Insert before the first pending card
             elements.carouselTrack.insertBefore(card, firstPending);
        } else {
             // No pending cards? Just append to end (it's all done or mixed)
             // But wait, if we have done cards A, B, C and we finish D.
             // If we insert before first pending, we maintain A B C D [Pending...].
             // If D was originally at index 0 (small file), and A B C are pending.
             // D finishes. Move D to... 
             // If there are NO done cards yet, D becomes first.
             // If A finishes next. Move A to before first pending.
             // This effectively sorts them by completion time!
             // Matches "chronological completion" order.
             elements.carouselTrack.appendChild(card);
        }

        const img = card.querySelector('.card-preview');
        // Ensure img.src is set. If previewUrl is null (already set by thumb event?), keep it?
        // Actually processCarouselBatch is called when item is popped from queue.
        // Queue item was pushed in 'result' handler.
        // We passed previewUrl: null in 'result' handler.
        // So here previewUrl is null.
        // We SHOULD NOT reset it to null if it's already there.
        if (previewUrl) {
            img.src = previewUrl;
        }
        img.style.cursor = 'zoom-in';
        
        img.onclick = () => {
            const all = Array.from(document.querySelectorAll('.card-preview'));
            openLightbox(all.indexOf(img));
        };

        imagesToDecode.push(img);

        const nameEl = card.querySelector('.card-filename');
        if (nameEl) {
            nameEl.textContent = data.fileName;
            nameEl.title = data.fileName;
        }
        card.classList.remove('pending');
        const statusIcon = card.querySelector('.status-icon');
        if (statusIcon) {
            statusIcon.classList.remove('waiting');
            statusIcon.classList.add('success');
            statusIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        }
    });

    await Promise.allSettled(imagesToDecode.map(img => img.decode().catch(e => {})));
}

export function updateCarouselScroll() {
    const track = elements.carouselTrack;
    const container = elements.carouselTrackContainer;
    if (!track || !container || state.totalFilesCount === 0) return;

    if (!isUserInteracting) {
        const doneCount = state.completed.size;
        
        // STOP tracking if ALL items are done
        if (state.totalFilesCount > 0 && doneCount === state.totalFilesCount) {
            // Sort carousel cards to original order when fully complete
            sortCarouselByOriginalOrder();
            return;
        }

        const cardWidth = 146; // 130px card + 16px gap (1rem)
        const scrollCenter = container.clientWidth / 2;
        
        let targetX;
        
        // Initial Phase: Scroll to end while parsing/waiting for first result
        if (doneCount === 0) {
            targetX = track.scrollWidth; // Go to end
        } else {
            // Processing Phase: Keep "head" in center (50% done, 50% pending)
            // Head is at index = doneCount
            targetX = (doneCount * cardWidth) - scrollCenter + (cardWidth / 2);
        }
        
        const trackWidth = track.scrollWidth;
        const maxScroll = trackWidth - container.clientWidth;
        
        // Clamp
        let clampedTarget = Math.max(0, Math.min(targetX, maxScroll));
        
        const current = container.scrollLeft;
        const dist = clampedTarget - current;
        
        // Adaptive speed
        // If far behind, move fast (0.3). If very far, snap or move faster.
        if (Math.abs(dist) > 1) {
            let speed = 0.03;
            // If we are lagging by more than 3 cards, speed up significantly
            if (Math.abs(dist) > (cardWidth * 3)) speed = 0.3;
            
            container.scrollLeft = current + (dist * speed); 
        }
    }
}

export function initCarouselDocs() {
    const cContainer = elements.carouselTrackContainer;
    
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

    if (cContainer) {

        cContainer.addEventListener('mousedown', startInteract);
        cContainer.addEventListener('touchstart', startInteract);
        cContainer.addEventListener('wheel', startInteract);
        
        cContainer.addEventListener('mouseup', endInteract);
        cContainer.addEventListener('touchend', endInteract);
        cContainer.addEventListener('wheel', endInteract); // Re-triggering end on wheel
    }

    if (elements.prevBtn) {
        elements.prevBtn.addEventListener('click', () => {
            startInteract(); 
            cContainer.scrollBy({ left: -cContainer.clientWidth, behavior: 'smooth' });
            endInteract(); 
        });
    }

    if (elements.nextBtn) {
        elements.nextBtn.addEventListener('click', () => {
            startInteract(); 
            cContainer.scrollBy({ left: cContainer.clientWidth, behavior: 'smooth' });
            endInteract(); 
        });
    }
}
