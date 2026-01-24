
/**
 * Handles Scroll Reveal and Typewriter effects for SEO content
 */

export function initScrollReveal() {
    const observerOptions = {
        root: null,
        rootMargin: '1px', // Trigger slightly before element enters viewport
        threshold: 0.1
    };

    // Pre-process elements: Hide text content immediately to prevent "already typed" flash
    // We store the original text in a data attribute for retrieval
    document.querySelectorAll('.scroll-reveal .type-target').forEach(el => {
        if (!el.dataset.originalText) {
            el.dataset.originalText = el.textContent;
            el.textContent = '';
            el.style.visibility = 'hidden'; // Hide until typing starts
        }
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                observer.unobserve(el);
                setTimeout(t => {
                    // Find elements to type in this section
                    const typeTargets = el.querySelectorAll('.type-target');
                    if (typeTargets.length > 0) {
                        typeTargets.forEach(target => {
                            target.style.visibility = 'visible';
                            // Use stored text if available, fallback to current (should be empty but safety first)
                            const text = target.dataset.originalText || target.textContent;
                            startTyping(target, text);

                        });
                    }
                    setTimeout(t => {
                        el.classList.add('visible');
                    }, 0);
                }, 200);

            }
        });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.scroll-reveal');
    revealElements.forEach(el => observer.observe(el));

    function startTyping(element, text) {
        // Add cursor
        element.classList.add('typewriter-cursor');

        // Typing logic
        let i = 0;
        function type() {
            if (i < text.length) {
                // Type 3 characters at once for very fast effect
                const chunk = text.slice(i, i + 3);
                element.textContent += chunk;
                i += 3;

                // Super fast random speed
                const speed = Math.random() * 5 + 1;
                setTimeout(type, speed);
            } else {
                element.classList.remove('typewriter-cursor');
                if (element.textContent !== text) {
                    element.textContent = text;
                }
            }
        }
        type();
    }
    // Safety: Force reveal after 3 seconds if something goes wrong
    // setTimeout(() => {
    //     revealElements.forEach(el => {
    //         if (!el.classList.contains('visible')) {
    //             el.classList.add('visible');
    //             // Ensure text is restored if typing didn't happen
    //             const typeTargets = el.querySelectorAll('.type-target');
    //             typeTargets.forEach(target => {
    //                 target.style.visibility = 'visible';
    //                 if (target.dataset.originalText && target.textContent === '') {
    //                     target.textContent = target.dataset.originalText;
    //                 }
    //             });
    //         }
    //     });
    // }, 3000);
}
