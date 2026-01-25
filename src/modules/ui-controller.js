import { state } from './state.js';
import { elements } from './dom.js';
import { formatSize, downloadBlob } from './utils.js';
import { openLightbox } from './carousel.js';
import { i18n } from './i18n.js';

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
    $el.find('.badge').text((i18n && i18n.t('waiting')) || 'Waiting');

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
                            title: (i18n && i18n.t('download')) || 'Download',
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
    const fallbacks = {
        'files': 'files',
        'saved': 'saved',
        'starting': 'Starting...',
        'processing': 'Processing',
        'total_saved_prefix': 'Total Saved:'
    };
    const t = (key) => (i18n && i18n.t(key)) || fallbacks[key] || key;

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
        if (state.completed.size > 0) {
            const rawPercent = Math.round((savedTotal / state.totalOriginalSize) * 100);
            const isSaving = savedTotal >= 0;
            const absPercent = Math.abs(rawPercent);
            
            const $parent = elements.headerTotalSaved.parent();
            
            // Hide the static label sibling if present
            $parent.find('span[data-i18n]').not(elements.headerTotalSaved).hide();
            
            // Determine styles and labels based on outcome
            const labelKey = isSaving ? 'total_saved_prefix' : 'total_added_prefix'; // Ensure 'total_added_prefix' exists in generic fallbacks or use hardcoded
            const labelText = isSaving ? (t('total_saved_prefix') || 'Total Saved:') : 'Total Added:';
            
            const colorClass = isSaving ? 'var(--success)' : 'var(--error)';
            const sign = isSaving ? '-' : '+';
            const valStr = formatSize(Math.abs(savedTotal));

            const html = `
                <span style="font-weight: 700; margin-right: 0.5rem; color: var(--text-main);">${formatSize(state.totalNewSize)}</span>
                <span style="opacity: 0.8; color: ${isSaving ? 'inherit' : 'var(--error)'};">${labelText} ${valStr}</span>
                <span style="color: ${colorClass}; font-weight: 700; margin-left: 0.35rem;">(${sign}${absPercent}%)</span>
            `;

            elements.headerTotalSaved.html(html);
            elements.headerTotalSaved.css({
                'display': 'inline-flex',
                'align-items': 'center'
            });
            $parent.css({
                'display': 'flex',
                'align-items': 'center',
                'gap': '0',
                'visibility': 'visible'
            });
        } else if (state.totalFilesCount > 0) {
            // Processing state - show "Processing..."
            const $parent = elements.headerTotalSaved.parent();
            // Hide the static label sibling if present
            $parent.find('span[data-i18n]').not(elements.headerTotalSaved).hide();
            
            const processingText = (typeof t === 'function' ? t('processing') : (i18n && i18n.t('processing')) || 'Processing...');
            elements.headerTotalSaved.html(`<span class="processing-text pulse">${processingText}</span>`);
            
            elements.headerTotalSaved.css({
                'display': 'inline-flex',
                'align-items': 'center'
            });
            $parent.css({
                'display': 'flex',
                'align-items': 'center',
                'gap': '0',
                'visibility': 'visible'
            });        
        } else {
            // Reserve space to avoid layout shift/flicker
            elements.headerTotalSaved.parent().css({
                'display': 'flex',
                'visibility': 'hidden'
            });
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
        const hasFiles = state.totalFilesCount > 0;
        const isDone = state.completed.size > 0 && 
                       state.completed.size === state.totalFilesCount && 
                       state.queue.length === 0 && 
                       state.processing.size === 0;
        
        if (hasFiles) {
            if (!elements.headerStats.hasClass('visible')) {
                elements.headerStats.addClass('visible');
            }
            // Show Actions only when done
            if (isDone) {
                elements.headerDownloadBtn.css({
                    'display': 'inline-flex',
                    'visibility': 'visible'
                });
                elements.headerClearBtn.css({
                    'display': 'inline-flex',
                    'visibility': 'visible'
                });
            } else {
                // Hide but keep space? 
                // However, on mobile space is tight. If we reserve space, the header top row is always tall.
                // The user complained about layout CHANGING. So fixed height is better.
                // We set .header-actions min-height in CSS.
                // We should make buttons take space.
                
                elements.headerDownloadBtn.css({
                    'display': 'inline-flex',
                    'visibility': 'hidden'
                });
                elements.headerClearBtn.css({
                    'display': 'inline-flex',
                    'visibility': 'hidden'
                });
            }
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




    // Outer Ring (Green) - Conversion Progress
    if (state.totalFilesCount > 0 && elements.stickyConversion.length) {
        
        if (state.completed.size === 0 && state.processing.size === 0 && state.queue.length === 0) {
             // Reset State - only if not already reset
             if (state.visual.conversionReset !== true) {
                 elements.stickyConversion.css({
                     'transform': 'scaleX(0)',
                     'opacity': '0'
                 });
                 if (!elements.stickyConversion.hasClass('bar-hidden')) {
                     elements.stickyConversion.addClass('bar-hidden');
                 }
                 state.processingStartTime = null;
                 state.visual.conversionReset = true;
                 state.visual.conversionOpacity = 0;
                 state.visual.lastConversionProgress = 0;
             }
        } else {
             // Active State
             if (!state.processingStartTime) {
                 state.processingStartTime = Date.now();
             }

             // Calculate progress using the TRUE total target (parsingTarget) to avoid regression
             // Fallback to totalFilesCount if parsingTarget isn't set yet (rare)
             const total = (state.parsingTarget && state.parsingTarget > 0) ? state.parsingTarget : state.totalFilesCount;
             const progress = total > 0 ? state.completed.size / total : 0;
             
             // Only update if progress changed
             if (state.visual.lastConversionProgress !== progress) {
                 const transformValue = `scaleX(${progress})`;
                 elements.stickyConversion.css('transform', transformValue);
                 state.visual.lastConversionProgress = progress;
             }
             
             // Only update opacity if needed (using cached state)
             if (state.visual.conversionOpacity !== 1) {
                 elements.stickyConversion.css('opacity', '1');
                 state.visual.conversionOpacity = 1;
                 state.visual.conversionReset = false;
             }
             
             // Only remove class if it exists AND we are not fully done (let auto-hide logic handle done state)
             if (state.completed.size < state.totalFilesCount) {
                 if (elements.stickyConversion.hasClass('bar-hidden')) {
                     elements.stickyConversion.removeClass('bar-hidden');
                 }
             }
        }
    }

    // Inner Ring & Sticky Parsing - keep simple for now or mirror logic? 
    // Parsing is usually too fast for ETA. Keeping simple LERP for rings.
    const dInner = state.visual.innerTarget - state.visual.innerProgress;
    if (Math.abs(dInner) > 0.0001) state.visual.innerProgress += dInner * LERP;
    else state.visual.innerProgress = state.visual.innerTarget;
    
    // Outer Progress is purely for Ring now (legacy visual)
    // We can just sync it to target for simplicity or keep LERP
    if (state.totalFilesCount > 0) {
         let target = state.completed.size / state.totalFilesCount;
         const dOuter = target - state.visual.outerProgress;
         if (Math.abs(dOuter) > 0.0001) state.visual.outerProgress += dOuter * LERP;
         else state.visual.outerProgress = target;
    } else {
         state.visual.outerProgress = 0;
    }

    // Apply
    if (elements.progressCircleInner.length) {
        const offset = CIRC_INNER - (state.visual.innerProgress * CIRC_INNER);
        if (state.visual.lastInnerOffset !== offset) {
            elements.progressCircleInner.css('strokeDashoffset', offset);
            state.visual.lastInnerOffset = offset;
        }
    }
    if (elements.progressCircleOuter.length) {
        const offset = CIRC_OUTER - (state.visual.outerProgress * CIRC_OUTER);
        if (state.visual.lastOuterOffset !== offset) {
            elements.progressCircleOuter.css('strokeDashoffset', offset);
            state.visual.lastOuterOffset = offset;
        }
    }

    // Sticky Bars
    // Parsing can stay LERP or simple scale
    if (elements.stickyParsing.length) {
         const transformValue = `scaleX(${state.visual.innerProgress})`;
         if (state.visual.lastParsingTransform !== transformValue) {
             elements.stickyParsing.css('transform', transformValue);
             state.visual.lastParsingTransform = transformValue;
         }
    }

    // Conversion is handled by ETA logic directly on CSS properties via transition-duration
    // Do NOT set transform here for stickyConversion
    // if (elements.stickyConversion.length) ... (removed)
    
    if (elements.stickySaved.length) {
        let sizeRatio = 0;
        
        const $bg = elements.stickySaved.next('.sticky-bar-saved-bg');

        if (state.totalOriginalSize > 0) {
            // Visualize relative size of the new files (New Size)
            sizeRatio = state.totalNewSize / state.totalOriginalSize;
            
            // Ensure visible - only if cache says it's hidden
            if (state.visual.savedVisible !== true) {
                elements.stickySaved.css('display', 'block');
                if ($bg.length) $bg.css('display', 'block');
                state.visual.savedVisible = true;
            }

            if (sizeRatio <= 1) {
                // SAVED (Normal Case)
                const transformValue = `scaleX(${sizeRatio})`;
                
                // Only update if changed
                if (state.visual.lastSavedTransform !== transformValue) {
                    elements.stickySaved.css('transform', transformValue);
                    state.visual.lastSavedTransform = transformValue;
                }
                
                // Only update background if it's not default
                if (state.visual.savedIsError !== false) {
                    elements.stickySaved.css('background-color', '');
                    if (elements.stickySaved.hasClass('bar-error')) {
                        elements.stickySaved.removeClass('bar-error');
                    }
                    state.visual.savedIsError = false;
                }
                
                // Reset BG to standard (Faint Green)
                if ($bg.length && state.visual.savedBgIsError !== false) {
                    $bg.css({
                        'background-color': '',
                        'opacity': ''
                    });
                    state.visual.savedBgIsError = false;
                }
            } else {
                // LOST (Increase Case)
                const excessRatio = sizeRatio - 1;
                let excessScale = excessRatio;
                if (excessScale > 1) excessScale = 1;

                const transformValue = `scaleX(${excessScale})`;
                
                // Only update if changed
                if (state.visual.lastSavedTransform !== transformValue) {
                    elements.stickySaved.css('transform', transformValue);
                    state.visual.lastSavedTransform = transformValue;
                }
                
                // Only update background if not already error
                if (state.visual.savedIsError !== true) {
                    elements.stickySaved.css('background-color', 'var(--error)');
                    if (!elements.stickySaved.hasClass('bar-error')) {
                        elements.stickySaved.addClass('bar-error');
                    }
                    state.visual.savedIsError = true;
                }

                // Make BG Solid Green to represent "Original Size" baseline
                if ($bg.length && state.visual.savedBgIsError !== true) {
                    $bg.css({
                        'background-color': 'var(--success)',
                        'opacity': '1'
                    });
                    state.visual.savedBgIsError = true;
                }
            }
        } else {
            // Hide if no stats - only if cache says it's visible
            if (state.visual.savedVisible !== false) {
                elements.stickySaved.css('display', 'none');
                if ($bg.length) $bg.css('display', 'none');
                state.visual.savedVisible = false;
                state.visual.lastSavedTransform = null;
                state.visual.savedIsError = null;
                state.visual.savedBgIsError = null;
            }
        }
    }

    // Logic Update for Targets
    const count = state.completed.size;
    const isParsing = state.totalFilesCount < state.parsingTarget;

    if (isParsing) {
        if (state.parsingTarget > 0) {
            state.visual.innerTarget = state.totalFilesCount / state.parsingTarget;
            if (elements.progressCircleInner.length) elements.progressCircleInner.css('opacity', '1');
            state.visual.outerTarget = (count + (state.processing.size * 0.8)) / state.parsingTarget; 
            if (state.visual.outerTarget > 1) state.visual.outerTarget = 0.99; // clamp while parsing 
            
            // Ensure parsing bar is visible during parsing
            if (elements.stickyParsing.length && elements.stickyParsing.hasClass('bar-hidden')) elements.stickyParsing.removeClass('bar-hidden');
        }
    } else if (state.totalFilesCount > 0) {
        state.visual.innerTarget = 1;

        if (!state.parsingCompleteTime) state.parsingCompleteTime = Date.now();
        
        const timeSinceParsing = Date.now() - state.parsingCompleteTime;
        
        if (elements.progressCircleInner.length) {
            if (timeSinceParsing > 300) {
                if (state.visual.innerCircleVisible !== false) {
                    elements.progressCircleInner.css('opacity', '0');
                    elements.progressCircleInner.css('visibility', 'hidden');
                    state.visual.innerCircleVisible = false;
                }
            } else {
                if (state.visual.innerCircleVisible !== true) {
                    elements.progressCircleInner.css('opacity', '1');
                    elements.progressCircleInner.css('visibility', 'visible');
                    state.visual.innerCircleVisible = true;
                }
            }
        }
        
        // Sticky Parsing Bar - Hide after 2s
        if (elements.stickyParsing.length) {
             if (timeSinceParsing > 2000) {
                 if (!elements.stickyParsing.hasClass('bar-hidden')) {
                     elements.stickyParsing.addClass('bar-hidden');
                 }
             }
        }

        // Logic handled in drawRings via Time-Velocity
        // Keeping this block for Pie Chart dependency if needed, but outerTarget is now unused for StickyBar
        // state.visual.outerTarget is irrelevant for the new logic, but we can set it for debug
        state.visual.outerTarget = 1;

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
        state.visual.conversionCompleteTime = null; // Reset timer
        state.parsingCompleteTime = null; // Reset parsing timer
        
        // Reset visibility - only if needed
        if (elements.stickyParsing.length && elements.stickyParsing.hasClass('bar-hidden')) {
            elements.stickyParsing.removeClass('bar-hidden');
        }
        if (elements.stickyConversion.length && elements.stickyConversion.hasClass('bar-hidden')) {
            elements.stickyConversion.removeClass('bar-hidden');
        }
        if (elements.pieDefaultContent.length && elements.pieDefaultContent.hasClass('hidden')) {
            elements.pieDefaultContent.removeClass('hidden');
        }
        if (elements.pieActiveContent.length && !elements.pieActiveContent.hasClass('hidden')) {
            elements.pieActiveContent.addClass('hidden');
        }
    }

    // Conversion Bar Auto-hide (Saved bar stays)
    if (state.totalFilesCount > 0 && 
        state.completed.size === state.totalFilesCount && 
        state.queue.length === 0) {
            
        if (!state.visual.conversionCompleteTime) {
            state.visual.conversionCompleteTime = Date.now();
        } else if (Date.now() - state.visual.conversionCompleteTime > 2000) {
            // Hide only conversion bar after 2s
            if (elements.stickyConversion.length && !elements.stickyConversion.hasClass('bar-hidden')) {
                elements.stickyConversion.addClass('bar-hidden');
            }
        }
    } else {
        // We are processing or idle with no files
        if (state.totalFilesCount > 0 || state.visual.innerProgress > 0) {
             state.visual.conversionCompleteTime = null;
             
             // Ensure conversion bar visible - only if hidden
             if (elements.stickyConversion.length && elements.stickyConversion.hasClass('bar-hidden')) {
                 elements.stickyConversion.removeClass('bar-hidden');
             }
             
             // Cleanup old parent logic if present in DOM (safety)
             if (elements.stickyParsing.length) {
                 elements.stickyParsing.parent().removeClass('auto-hide');
                 elements.stickyParsing.parent().css('opacity', '');
             }
        }
    }
}

export function updateQualityDisplay() {
    if (elements.qualityValue.length) elements.qualityValue.text(state.quality);
}
