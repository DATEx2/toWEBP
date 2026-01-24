import { state } from './state.js';
import { elements } from './dom.js';
import { formatSize, downloadBlob } from './utils.js';
import { openLightbox } from './carousel.js';

export function createCarouselCard(id, thumbnail, filename) {
    if (!elements.carouselTrack || !id) return;
    
    // Check if exists
    if (document.getElementById(`carousel-${id}`)) return; 
    
    // Safety for filename
    const safeName = filename || 'Image';

    const card = document.createElement('div');
    card.className = 'carousel-card pending';
    card.id = `carousel-${id}`; // Use carousel-ID to avoid conflicts with other cards
    
    const wrapper = document.createElement('div');
    wrapper.className = 'card-image-wrapper';
    
    const img = document.createElement('img');
    img.className = 'card-preview'; // Reverted to card-preview to match CSS and selector logic

    // Immediate Feedback: Placeholder 
    // The Web Worker generates it efficiently and sends a 'thumb' message via thumbnail parameter 
    img.src = thumbnail;//'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'card-status-overlay';
    
    const icon = document.createElement('div');
    icon.className = 'status-icon waiting';
    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>`;

    overlay.appendChild(icon);
    wrapper.appendChild(img);
    wrapper.appendChild(overlay);
    
    // Actions Wrapper
    const actions = document.createElement('div');
    actions.className = 'card-actions'; 
    // We add buttons in processCarouselBatch or here? 
    // Original app.js added structure differently in createCarouselCard vs processCarouselBatch (update).
    // Let's stick to the structure found in app.js:
    // app.js created card > wrapper > img+overlay. Then app.js added 'card-filename' and actions in template?
    // Wait, createCarouselCard in app.js (line 803) did NOT use the template! It built DOM manually.
    // BUT processCarouselBatch (line 1169) uses carouselTemplate!
    // This looks like a mix.
    // The "Immediate" card (createCarouselCard) is a placeholder. 
    // The "Result" card (processCarouselBatch) replaces or updates it?
    // In app.js line 1184, processCarouselBatch checks if card exists. If not, it clones template.
    // If it exists (created by createCarouselCard), it updates it.
    // BUT createCarouselCard creates a DIV with class `carousel-card pending`.
    // The template has `carousel-card` with `card-info` and `card-actions`.
    // The manually created one DOES NOT have info/actions logic yet.
    // So if processCarouselBatch updates it, it needs to be robust. 
    // Let's replicate the manual creation to match app.js behavior.
    
    // Manual construction of placeholder
    // It seems missing `card-info` and `card-actions` in manual placeholder in app.js?
    // Yes, line 859 appends wrapper to card, then card to track. No info/actions.
    // So placeholder is just image.
    
    card.appendChild(wrapper);
    
    // Add Placeholder Info/Action containers so update logic doesn't fail?
    // Logic in processCarouselBatch:
    // card.querySelector('.card-filename').textContent = ...
    // If these don't exist, it will crash.
    // Fix: Add empty containers.
    
    const info = document.createElement('div');
    info.className = 'card-info';
    const filenameEl = document.createElement('div');
    filenameEl.className = 'card-filename';
    filenameEl.textContent = safeName;
    filenameEl.title = safeName;
    info.appendChild(filenameEl);
    card.appendChild(info);
    
    const acts = document.createElement('div');
    acts.className = 'card-actions'; 
    // Buttons added in processCarouselBatch when done
    card.appendChild(acts);
    
    // Close button (Top Right)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'card-close-btn';
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6L18 18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    closeBtn.onclick = () => card.remove();
    wrapper.appendChild(closeBtn); // It's usually absolute in wrapper

    elements.carouselTrack.appendChild(card);
}

export function createUiItem(id, file) {
    const clone = elements.fileItemTemplate.content.cloneNode(true);
    const el = clone.querySelector('.file-item');
    el.id = `file-${id}`;

    // Setup details
    el.querySelector('.file-name').textContent = file.name;
    el.querySelector('.size-old').textContent = formatSize(file.size);

    // Preview
    const img = el.querySelector('.file-preview');
    const url = URL.createObjectURL(file);
    img.src = url;
    el.dataset.previewUrl = url;

    // Lightbox Zoom
    el.style.cursor = 'zoom-in';
    el.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        
        // Find index in the list to sync with carousel
        const index = Array.from(elements.fileList.children).indexOf(el);
        if (index !== -1) {
            openLightbox(index);
        }
    };

    // Status
    el.classList.add('converting');
    el.querySelector('.badge').textContent = (window.i18n && window.i18n.t('waiting')) || 'Waiting';

    return el;
}

export function updateVisuals() {
    const BATCH_LIMIT = 100;

    if (state.pendingRowUpdates.length > 0) {
        const updates = state.pendingRowUpdates.splice(0, BATCH_LIMIT);

        for (const update of updates) {
            const row = document.getElementById(`file-${update.id}`);
            if (!row) continue;

            row.classList.remove('converting');

            if (update.success) {
                // Carousel Done UI


                row.querySelector('.size-new').innerHTML = ` <span style="opacity:0.6">&rarr;</span> ${formatSize(update.newSize)}`;
                
                const badge = row.querySelector('.badge');
                badge.textContent = `-${update.savedPercent}%`;
                badge.classList.add('success');

                const dlBtn = row.querySelector('.download-btn');
                dlBtn.disabled = false;
                dlBtn.onclick = () => downloadBlob(update.blob, update.newName);

                // Update Card Actions - find the card
                const card = document.getElementById(`carousel-${update.id}`);
                if (card) {
                    const acts = card.querySelector('.card-actions');
                    if (acts) {
                        // Clear existing (if any) and add Download
                        acts.innerHTML = '';
                        const btn = document.createElement('button');
                        btn.className = 'card-action-btn'; // Use specific class instead of generic
                        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 16L12 8M12 16L9 13M12 16L15 13M19 21H5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                        btn.title = (window.i18n && window.i18n.t('download')) || 'Download';
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            downloadBlob(update.blob, update.newName);
                        };
                        acts.appendChild(btn);
                    }
                    
                    // Update Status Icon
                    const overlay = card.querySelector('.card-status-overlay');
                    const icon = card.querySelector('.status-icon');
                    if (icon) {
                         icon.className = 'status-icon success';
                         icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17L4 12"/></svg>`;
                    }
                    if (overlay) overlay.classList.add('done');
                    card.classList.remove('pending');
                }
            } else {
                row.querySelector('.badge').textContent = 'Error';
            }
        }

        if (state.pendingRowUpdates.length > 0) {
            state.renderDirty = true;
        }
    }
}

export function updateStats() {
    if (!state.parsingTarget) return;
    
    // Check if i18n is ready, otherwise use fallbacks
    const t = (key) => (window.i18n && window.i18n.t(key)) || key;

    const savedTotal = (state.totalOriginalSize - state.totalNewSize);
    const savedStr = formatSize(savedTotal);

    if (elements.pieMainText) {
        const hasFiles = state.grandTotalInputSize > 0;
        if (hasFiles) {
            const processedInput = state.totalOriginalSize;
            const totalInput = state.grandTotalInputSize;
            const totalNew = state.totalNewSize;
            const isDone = state.completed.size === state.totalFilesCount && state.totalFilesCount > 0 && state.queue.length === 0;

            let mainText = '';
            let subHtml = '';

            if (isDone) {
                // Final completion message
                mainText = `${formatSize(processedInput)} → ${formatSize(totalNew)}`;
                
                if (savedTotal > 0) {
                    const savedPercent = Math.round((savedTotal / processedInput) * 100);
                    subHtml = `<span style="color: var(--success); font-weight: 700;">-${savedPercent}%</span> (${formatSize(savedTotal)} ${t('saved')})`;
                } else if (savedTotal < 0) {
                    // File got bigger - show warning
                    const increasePercent = Math.round((Math.abs(savedTotal) / processedInput) * 100);
                    subHtml = `<span style="color: var(--warning); font-weight: 600;">+${increasePercent}%</span> (${formatSize(Math.abs(savedTotal))} larger)`;
                } else {
                    // Same size
                    subHtml = `<span style="color: var(--text-muted);">Same size</span>`;
                }
            } else {
                // In-progress message
                mainText = `${formatSize(processedInput)} / ${formatSize(totalInput)}`;
                
                // Sub-text during processing
                if (state.totalNewSize > 0 && savedTotal > 0) {
                    subHtml = `${t('total_saved_prefix')} ${savedStr}`;
                    if (state.lastRunLookup && state.lastRunLookup.size > 0) {
                        const diffSize = state.sessionDiff || 0;
                        if (diffSize !== 0) {
                            const diffStr = formatSize(diffSize);
                            const sign = diffSize > 0 ? '+' : '';
                            const colorClass = diffSize < 0 ? 'diff-better' : 'diff-worse';
                            subHtml += ` <span class="${colorClass}">(${sign}${diffStr})</span>`;
                        }
                    }
                } else if (state.queue.length > 0) {
                    subHtml = t('starting');
                }
            }

            // ONLY update DOM if changed to prevent DevTools flashing / layout thrashing
            if (elements.pieMainText.textContent !== mainText) {
                elements.pieMainText.textContent = mainText;
            }
            if (elements.pieSubText && elements.pieSubText.innerHTML !== subHtml) {
                elements.pieSubText.innerHTML = subHtml;
            }

        } else {
            const processingText = t('processing');
            if (elements.pieMainText.textContent !== processingText) {
                elements.pieMainText.textContent = processingText;
            }
        }
    }
    
    // Global Labels
    const count = state.completed.size;
    const countText = `${count} file${count !== 1 ? 's' : ''} converted`;
    if (elements.filesCountSpan && elements.filesCountSpan.textContent !== countText) {
        elements.filesCountSpan.textContent = countText;
    }
    
    if (elements.downloadAllBtn) {
        const shouldDisable = count === 0;
        if (elements.downloadAllBtn.disabled !== shouldDisable) elements.downloadAllBtn.disabled = shouldDisable;
    }

    const savedTextLabel = savedTotal > 0 ? `Saved ${formatSize(savedTotal)}` : '';
    if (elements.totalSavedSpan && elements.totalSavedSpan.textContent !== savedTextLabel) {
        elements.totalSavedSpan.textContent = savedTextLabel;
        const displayVal = savedTotal > 0 ? 'inline' : 'none';
        if (elements.totalSavedSpan.style.display !== displayVal) elements.totalSavedSpan.style.display = displayVal;
    }

    // Sticky Headers
    if (elements.headerFilesCount && elements.headerFilesCount.textContent !== (count + (count !== 1 ? ' files' : ' file'))) {
       // logic above used 'file'/'files' but here simplifying check
       elements.headerFilesCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    }
    if (elements.headerTotalSaved && elements.headerTotalSaved.textContent !== savedTextLabel) {
        elements.headerTotalSaved.textContent = savedTextLabel;
    }
    
    const sizeStats = `${formatSize(state.totalNewSize)} / ${formatSize(state.totalOriginalSize)}`;
    if (elements.headerSizeStats && elements.headerSizeStats.textContent !== sizeStats) {
        elements.headerSizeStats.textContent = sizeStats;
    }
    
    if (elements.headerDownloadBtn) {
         const shouldDisable = count === 0;
         if (elements.headerDownloadBtn.disabled !== shouldDisable) elements.headerDownloadBtn.disabled = shouldDisable;
    }

    if (elements.headerStats) {
        const isDone = state.completed.size > 0 && state.queue.length === 0 && state.processing.size === 0;
        
        if (isDone) {
            if (!elements.headerStats.classList.contains('visible')) {
                elements.headerStats.classList.add('visible');
            }
            // Show Actions
            if (elements.headerDownloadBtn) elements.headerDownloadBtn.style.display = 'inline-flex';
            if (elements.headerClearBtn) elements.headerClearBtn.style.display = 'inline-flex';
        } else {
            if (elements.headerStats.classList.contains('visible')) {
                elements.headerStats.classList.remove('visible');
            }
            // Hide Actions
            if (elements.headerDownloadBtn) elements.headerDownloadBtn.style.display = 'none';
            if (elements.headerClearBtn) elements.headerClearBtn.style.display = 'none';
        }
    }
}

export function drawRings() {
    updateStats();

    const LERP = 0.05;
    const CIRC_INNER = 678;
    const CIRC_OUTER = 729;

    // Inner Ring (Yellow) - Parsing
    const dInner = state.visual.innerTarget - state.visual.innerProgress;
    if (Math.abs(dInner) > 0.0001) state.visual.innerProgress += dInner * LERP;
    else state.visual.innerProgress = state.visual.innerTarget;

    // Outer Ring (Green) - Conversion
    const dOuter = state.visual.outerTarget - state.visual.outerProgress;
    if (Math.abs(dOuter) > 0.0001) state.visual.outerProgress += dOuter * LERP;
    else state.visual.outerProgress = state.visual.outerTarget;

    // Apply
    if (elements.progressCircleInner) {
        const offset = CIRC_INNER - (state.visual.innerProgress * CIRC_INNER);
        elements.progressCircleInner.style.strokeDashoffset = offset;
    }
    if (elements.progressCircleOuter) {
        const offset = CIRC_OUTER - (state.visual.outerProgress * CIRC_OUTER);
        elements.progressCircleOuter.style.strokeDashoffset = offset;
    }

    // Sticky Bars
    if (elements.stickyParsing) elements.stickyParsing.style.width = (state.visual.innerProgress * 100) + '%';
    if (elements.stickyConversion) elements.stickyConversion.style.width = (state.visual.outerProgress * 100) + '%';
    
    if (elements.stickySaved) {
        let savedRatio = 0;
        if (state.totalOriginalSize > 0) {
            const saved = state.totalOriginalSize - state.totalNewSize;
            savedRatio = saved / state.totalOriginalSize;
        }
        elements.stickySaved.style.transform = `scaleY(${savedRatio})`;
    }

    // Logic Update for Targets
    const count = state.completed.size;
    const isParsing = state.totalFilesCount < state.parsingTarget;

    if (isParsing) {
        if (state.parsingTarget > 0) {
            state.visual.innerTarget = state.totalFilesCount / state.parsingTarget;
            if (elements.progressCircleInner) elements.progressCircleInner.style.opacity = '1';
            state.visual.outerTarget = count / state.parsingTarget; 
        }
    } else if (state.totalFilesCount > 0) {
        state.visual.innerTarget = 1;

        if (!state.parsingCompleteTime) state.parsingCompleteTime = Date.now();
        
        if (elements.progressCircleInner) {
            if (Date.now() - state.parsingCompleteTime > 300) {
                elements.progressCircleInner.style.opacity = '0';
                elements.progressCircleInner.style.visibility = 'hidden';
            } else {
                elements.progressCircleInner.style.opacity = '1';
                elements.progressCircleInner.style.visibility = 'visible';
            }
        }

        state.visual.outerTarget = count / state.totalFilesCount;

        // Pie Chart SVG var 
        if (state.totalOriginalSize > 0 && elements.pieChart) {
             const compressedPercent = (state.totalNewSize / state.totalOriginalSize) * 100;
             const deg = (compressedPercent / 100) * 360;
             elements.pieChart.style.setProperty('--p', `${deg}deg`);
        }
    } else {
        // Reset
        state.visual.innerTarget = 0;
        state.visual.outerTarget = 0;
        if (elements.pieDefaultContent) elements.pieDefaultContent.classList.remove('hidden');
        if (elements.pieActiveContent) elements.pieActiveContent.classList.add('hidden');
    }
}

export function updateQualityDisplay() {
    if (elements.qualityValue) elements.qualityValue.textContent = state.quality;
}
