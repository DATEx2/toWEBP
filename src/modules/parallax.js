export function initParallax() {
    let ticking = false;
    document.addEventListener('mousemove', (e) => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth - 0.5) * 2;
                const y = (e.clientY / window.innerHeight - 0.5) * 2;
                
                const blobs = document.querySelectorAll('.blob');
                blobs.forEach((blob, index) => {
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
