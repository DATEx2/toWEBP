
export function setupChartInteractions() {
    const $tooltip = $('#chart-tooltip');
    const $container = $('.stats-circle'); 
    
    $container.on('mousemove', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = e.clientX - rect.left - centerX;
        const y = e.clientY - rect.top - centerY;
        
        const r = Math.sqrt(x*x + y*y);
        
        let angle = (Math.atan2(y, x) * 180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        
        // Active Ring Zone (106px - 14px stroke = approx 92px to 120px)
        const inRing = r >= 90 && r <= 125; 
        
        if (!inRing || state.totalFilesCount === 0) {
            hideTooltip();
            clearEffects();
            return;
        }

        const ratio = state.totalOriginalSize > 0 ? state.totalNewSize / state.totalOriginalSize : 0;
        const progressLines = state.visual.outerProgress * 360;
        
        let isRed = false;
        let isGreen = false;
        
        if (state.totalOriginalSize > 0) {
            let excessDeg = 0;
            if (ratio > 1) {
                const excessRatio = Math.min(ratio - 1, 1);
                excessDeg = progressLines * excessRatio;
            }
            
            if (angle < excessDeg) isRed = true;
            else if (angle < progressLines) isGreen = true;
        }
        
        if (isRed) {
            const added = state.totalNewSize - state.totalOriginalSize;
            const p = Math.round((ratio - 1) * 100);
            showTooltip(e, `+${p}% (${formatSize(added)} added)`);
            setEffect('pie');
        } else if (isGreen) {
            const saved = state.totalOriginalSize - state.totalNewSize;
            let percent = Math.round((1 - ratio) * 100);
            if (percent < 0) percent = 0;
            showTooltip(e, `New File Size ${formatSize(state.totalNewSize)} -${percent}% (${formatSize(saved)} saved)`);
            setEffect('pie');
        } else {
            const yellowDeg = state.visual.innerProgress * 360;
            if (angle < yellowDeg) {
                const p = Math.round(state.visual.innerProgress * 100);
                showTooltip(e, `Processing ${state.completed.size}/${state.totalFilesCount} ${p}%`);
                setEffect('yellow');
            } else {
                hideTooltip();
                clearEffects();
            }
        }
    }).on('mouseleave', () => {
        hideTooltip();
        clearEffects();
    });

    function showTooltip(e, text) {
        $tooltip.text(text).removeClass('hidden').addClass('visible');
        // Prevent tooltip from going off-screen
        let left = e.clientX + 15;
        let top = e.clientY + 15;
        
        // Simple bounds check if needed, but usually OK for chart center
        $tooltip.css({ left: left + 'px', top: top + 'px' });
    }
    
    function hideTooltip() {
        $tooltip.removeClass('visible');
    }
    
    function setEffect(type) {
        clearEffects();
        if (type === 'pie') {
            elements.pieChart.addClass('pop-scale');
        } else if (type === 'yellow') {
            elements.progressCircleInner.addClass('stroke-pop');
        }
    }
    
    function clearEffects() {
        elements.pieChart.removeClass('pop-scale');
        elements.progressCircleInner.removeClass('stroke-pop');
    }
}
