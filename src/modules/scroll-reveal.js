
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
    $('.scroll-reveal .type-target').each(function() {
        const $el = $(this);
        if (!$el.data('originalText')) {
            $el.data('originalText', $el.text());
            $el.text('');
            $el.css('visibility', 'hidden'); // Hide until typing starts
        }
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const $el = $(el);
                observer.unobserve(el);
                setTimeout(t => { 
                    // Find elements to type in this section
                    const $typeTargets = $el.find('.type-target');
                    if ($typeTargets.length > 0) {
                        $typeTargets.each(function() {
                            const $target = $(this);
                            $target.text(''); 
                            $target.css('visibility', 'visible');
                            // Use stored text if available, fallback to current (should be empty but safety first)
                            const text = $target.data('originalText') || $target.text();
                            startTyping($target, text, 20);
                        });
                    }
                    setTimeout(t => {
                        $el.addClass('visible');
                    }, 0);
                }, 200);

            }
        });
    }, observerOptions);

    $('.scroll-reveal').each(function() {
        observer.observe(this);
    });

    function startTyping($element, text, baseSpeed = 0) {
        // Add cursor
        $element.addClass('typewriter-cursor');

        // Typing logic
        let i = 0;
        function type() {
            if (i < text.length) {
                // Type 3 characters at once for very fast effect
                const chunk = text.slice(i, i + 3);
                $element.text($element.text() + chunk);
                i += 3;

                // Super fast random speed
                const speed = Math.random() * 5 + 1 + baseSpeed;
                setTimeout(type, speed);
            } else {
                $element.removeClass('typewriter-cursor');
                if ($element.text() !== text) {
                    $element.text(text);
                }
            }
        }
        type();
    }
}
