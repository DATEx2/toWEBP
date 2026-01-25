import { state } from './state.js';
import { elements } from './dom.js';
import { formatSize, downloadBlob } from './utils.js';
import { openLightbox } from './carousel.js';

export function createCarouselCard(id, thumbnail, filename) {
    if (!elements.carouselTrack.length || !id) return;
    
    // Check if exists
    if ($(`#carousel-${id}`).length) return; 
    
    // Safety for filename
    const safeName = filename || 'Image';

    const $card = $('<div>', {
        class: 'carousel-card pending',
        id: `carousel-${id}`
    });
    
    const $wrapper = $('<div>', { class: 'card-image-wrapper' });
    
    const $img = $('<img>', {
        class: 'card-preview',
        src: thumbnail // Input is base64
    });

    // Overlay
    const $overlay = $('<div>', { class: 'card-status-overlay' });
    
    const $icon = $('<div>', {
        class: 'status-icon waiting',
        html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>`
    });

    $overlay.append($icon);
    $wrapper.append($img, $overlay);
    
    $card.append($wrapper);
    
    const $info = $('<div>', { class: 'card-info' });
    const $filenameEl = $('<div>', {
        class: 'card-filename',
        text: safeName,
        title: safeName
    });
    $info.append($filenameEl);
    $card.append($info);
    
    const $acts = $('<div>', { class: 'card-actions' });
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

export function createUiItem(id, file) {
    // Template content is raw DOM content, not jQuery object
    const templateRaw = elements.fileItemTemplate[0]; 
    if (!templateRaw) return $();

    const clone = templateRaw.content.cloneNode(true);
    // Wrap the content in jQuery. Note: content contains #text nodes too.
    // clone is a DocumentFragment.
    // We want the .file-item inside it.
    const $el = $(clone).find('.file-item');
    
    $el.attr('id', `file-${id}`);

    // Setup details
    $el.find('.file-name').text(file.name);
    $el.find('.size-old').text(formatSize(file.size));

    // Preview
    const $img = $el.find('.file-preview');
    const url = URL.createObjectURL(file);
    $img.attr('src', url);
    $el.data('previewUrl', url); // Use .data()

    // Lightbox Zoom
    $el.css('cursor', 'zoom-in');
    $el.on('click', (e) => {
        if ($(e.target).closest('button, a').length) return;
        
        // Find index in the list to sync with carousel
        // elements.fileList is jQuery obj
        const index = elements.fileList.children().index($el);
        if (index !== -1) {
            openLightbox(index);
        }
    });

    // Status
    $el.addClass('converting');
    $el.find('.badge').text((window.i18n && window.i18n.t('waiting')) || 'Waiting');

    return $el;
}

export function updateVisuals() {
    const BATCH_LIMIT = 100;

    if (state.pendingRowUpdates.length > 0) {
        const updates = state.pendingRowUpdates.splice(0, BATCH_LIMIT);

        for (const update of updates) {
            const $row = $(`#file-${update.id}`);
            if (!$row.length) continue;

            $row.removeClass('converting');

            if (update.success) {
                // Carousel Done UI

                $row.find('.size-new').html(` <span style="opacity:0.6">&rarr;</span> ${formatSize(update.newSize)}`);
                
                const $badge = $row.find('.badge');
                $badge.text(`-${update.savedPercent}%`);
                $badge.addClass('success');

                const $dlBtn = $row.find('.download-btn');
                $dlBtn.prop('disabled', false);
                $dlBtn.on('click', () => downloadBlob(update.blob, update.newName));

                // Update Card Actions - find the card
                const $card = $(`#carousel-${update.id}`);
                if ($card.length) {
                    const $acts = $card.find('.card-actions');
                    if ($acts.length) {
                        // Clear existing (if any) and add Download
                        $acts.empty();
                        const $btn = $('<button>', {
                            class: 'card-action-btn',
                            html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 16L12 8M12 16L9 13M12 16L15 13M19 21H5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
                            title: (window.i18n && window.i18n.t('download')) || 'Download',
                            click: (e) => {
                                e.stopPropagation();
                                downloadBlob(update.blob, update.newName);
                            }
                        });
                        $acts.append($btn);
                    }
                    
                    // Update Status Icon
                    const $overlay = $card.find('.card-status-overlay');
                    const $icon = $card.find('.status-icon');
                    if ($icon.length) {
                         $icon.removeClass('waiting').addClass('success');
                         $icon.html(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17L4 12"/></svg>`);
                    }
                    if ($overlay.length) $overlay.addClass('done');
                    $card.removeClass('pending');
                }
            } else {
                $row.find('.badge').text('Error');
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

    if (elements.pieMainText.length) {
        const hasFiles = state.grandTotalInputSize > 0;
        if (hasFiles) {
            const processedInput = state.totalOriginalSize;
            const totalInput = state.grandTotalInputSize;
            const totalNew = state.totalNewSize;
            const isDone = state.completed.size === state.totalFilesCount && state.totalFilesCount > 0 && state.queue.length === 0;

            let mainText = '';
            let subHtml = '';

            if (isDone) {
                // Final completion message - SIMPLIFIED
                mainText = `${state.completed.size} ${t('files')}`;
                
                if (savedTotal > 0) {
                    const savedPercent = Math.round((savedTotal / processedInput) * 100);
                    subHtml = `<span style="color: var(--success); font-weight: 700;">-${savedPercent}%</span> <span style="font-size: 0.9em; opacity: 0.9;">(${savedStr} ${t('saved')})</span>`;
                } else if (savedTotal < 0) {
                    // File got bigger - show warning
                    const increasePercent = Math.round((Math.abs(savedTotal) / processedInput) * 100);
                    subHtml = `<span style="color: var(--error); font-weight: 700;">+${increasePercent}%</span> <span style="font-size: 0.9em; opacity: 0.9;">(${formatSize(Math.abs(savedTotal))} added)</span>`;
                } else {
                    subHtml = `<span style="opacity: 0.7;">0B ${t('saved')}</span>`;
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

            // ONLY update DOM if changed
            if (elements.pieMainText.text() !== mainText) {
                elements.pieMainText.text(mainText);
            }
            if (elements.pieSubText.length && elements.pieSubText.html() !== subHtml) {
                elements.pieSubText.html(subHtml);
            }

        } else {
            const processingText = t('processing');
            if (elements.pieMainText.text() !== processingText) {
                elements.pieMainText.text(processingText);
            }
        }
    }
    
    // Global Labels
    const count = state.completed.size;
    const countText = `${count} file${count !== 1 ? 's' : ''} converted`;
    if (elements.filesCountSpan.length && elements.filesCountSpan.text() !== countText) {
        elements.filesCountSpan.text(countText);
    }
    
    if (elements.downloadAllBtn.length) {
        const shouldDisable = count === 0;
        if (elements.downloadAllBtn.prop('disabled') !== shouldDisable) elements.downloadAllBtn.prop('disabled', shouldDisable);
    }

    const savedTextLabel = savedTotal > 0 ? `Saved ${formatSize(savedTotal)}` : '';
    if (elements.totalSavedSpan.length && elements.totalSavedSpan.text() !== savedTextLabel) {
        elements.totalSavedSpan.text(savedTextLabel);
        // .css('display') check might return 'inline' or 'none'
        const displayVal = savedTotal > 0 ? 'inline' : 'none';
        if (elements.totalSavedSpan.css('display') !== displayVal) elements.totalSavedSpan.css('display', displayVal);
    }

    // Sticky Headers
    if (elements.headerFilesCount.length) {
       elements.headerFilesCount.text(`${count} file${count !== 1 ? 's' : ''}`);
    }
    if (elements.headerTotalSaved.length) {
        if (savedTotal > 0) {
            const savedTextLabel = `${t('total_saved_prefix')} ${formatSize(savedTotal)}`;
            elements.headerTotalSaved.text(savedTextLabel);
            elements.headerTotalSaved.css('display', 'inline');
        } else {
            elements.headerTotalSaved.css('display', 'none');
        }
    }
    
    const sizeStats = `${formatSize(state.totalNewSize)} / ${formatSize(state.totalOriginalSize)}`;
    if (elements.headerSizeStats.length && elements.headerSizeStats.text() !== sizeStats) {
        elements.headerSizeStats.text(sizeStats);
    }
    
    if (elements.headerDownloadBtn.length) {
         const shouldDisable = count === 0;
         if (elements.headerDownloadBtn.prop('disabled') !== shouldDisable) elements.headerDownloadBtn.prop('disabled', shouldDisable);
    }

    if (elements.headerStats.length) {
        const isDone = state.completed.size > 0 && state.queue.length === 0 && state.processing.size === 0;
        
        if (isDone) {
            if (!elements.headerStats.hasClass('visible')) {
                elements.headerStats.addClass('visible');
            }
            // Show Actions
            elements.headerDownloadBtn.css('display', 'inline-flex');
            elements.headerClearBtn.css('display', 'inline-flex');
        } else {
            if (elements.headerStats.hasClass('visible')) {
                elements.headerStats.removeClass('visible');
            }
            // Hide Actions
            elements.headerDownloadBtn.css('display', 'none');
            elements.headerClearBtn.css('display', 'none');
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
    if (elements.progressCircleInner.length) {
        const offset = CIRC_INNER - (state.visual.innerProgress * CIRC_INNER);
        elements.progressCircleInner.css('strokeDashoffset', offset);
    }
    if (elements.progressCircleOuter.length) {
        const offset = CIRC_OUTER - (state.visual.outerProgress * CIRC_OUTER);
        elements.progressCircleOuter.css('strokeDashoffset', offset);
    }

    // Sticky Bars
    if (elements.stickyParsing.length) elements.stickyParsing.css('width', (state.visual.innerProgress * 100) + '%');
    if (elements.stickyConversion.length) elements.stickyConversion.css('width', (state.visual.outerProgress * 100) + '%');
    
    if (elements.stickySaved.length) {
        let savedRatio = 0;
        if (state.totalOriginalSize > 0) {
            const saved = state.totalOriginalSize - state.totalNewSize;
            savedRatio = saved / state.totalOriginalSize;
        }
        elements.stickySaved.css('transform', `scaleY(${savedRatio})`);
    }

    // Logic Update for Targets
    const count = state.completed.size;
    const isParsing = state.totalFilesCount < state.parsingTarget;

    if (isParsing) {
        if (state.parsingTarget > 0) {
            state.visual.innerTarget = state.totalFilesCount / state.parsingTarget;
            if (elements.progressCircleInner.length) elements.progressCircleInner.css('opacity', '1');
            state.visual.outerTarget = count / state.parsingTarget; 
        }
    } else if (state.totalFilesCount > 0) {
        state.visual.innerTarget = 1;

        if (!state.parsingCompleteTime) state.parsingCompleteTime = Date.now();
        
        if (elements.progressCircleInner.length) {
            if (Date.now() - state.parsingCompleteTime > 300) {
                elements.progressCircleInner.css('opacity', '0');
                elements.progressCircleInner.css('visibility', 'hidden');
            } else {
                elements.progressCircleInner.css('opacity', '1');
                elements.progressCircleInner.css('visibility', 'visible');
            }
        }

        state.visual.outerTarget = count / state.totalFilesCount;

        // Pie Chart SVG var - used for conic-gradient
        if (state.totalOriginalSize > 0 && elements.pieChart.length) {
             const compressedPercent = (state.totalNewSize / state.totalOriginalSize) * 100;
             const deg = (compressedPercent / 100) * 360;
             elements.pieChart.css('--p', `${deg}deg`);
        }
    } else {
        // Reset
        state.visual.innerTarget = 0;
        state.visual.outerTarget = 0;
        if (elements.pieDefaultContent.length) elements.pieDefaultContent.removeClass('hidden');
        if (elements.pieActiveContent.length) elements.pieActiveContent.addClass('hidden');
    }
}

export function updateQualityDisplay() {
    if (elements.qualityValue.length) elements.qualityValue.text(state.quality);
}
