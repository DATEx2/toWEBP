export function initParallax() {
    let ticking = false;
    $(document).on('mousemove', (e) => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth - 0.5) * 2;
                const y = (e.clientY / window.innerHeight - 0.5) * 2;
                
                $('.blob').each(function(index) {
                    const $blob = $(this);
                    const speed = (index + 1) * 30; 
                    const xOffset = x * speed * (index % 2 === 0 ? 1 : -1);
                    const yOffset = y * speed * (index % 2 === 0 ? 1 : -1);
                    
                    $blob.css('transform', `translate(${xOffset}px, ${yOffset}px)`);
                });
                ticking = false;
            });
            ticking = true;
        }
    });
}
