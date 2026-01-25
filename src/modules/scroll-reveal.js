
/**
 * Handles Scroll Reveal and Typewriter effects for SEO content
 */

export function initScrollReveal() {
    const observerOptions = {
        root: null,
        rootMargin: '-10px', // Trigger slightly before element enters viewport
        threshold: 0.1
    };

    // Pre-process elements: Hide text content immediately to prevent "already typed" flash
    // We store the original HTML in a data attribute for retrieval
    $('.scroll-reveal .type-target').each(function() {
        const $el = $(this);
        if (!$el.data('originalHtml')) {
            $el.data('originalHtml', $el.html());
            $el.html('');
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
                            $target.html(''); 
                            $target.css('visibility', 'visible');
                            // Use stored html if available
                            const content = $target.data('originalHtml') || $target.html();
                            startTyping($target, content, Math.random() * 5 + 1);
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

    function startTyping($element, htmlContent, baseSpeed = 0) {
        // Add cursor
        $element.addClass('typewriter-cursor');

        // Typing logic
        let i = 0;
        let currentHtml = '';

        function type() {
            if (i < htmlContent.length) {
                const char = htmlContent[i];
                
                if (char === '<') {
                    // Tag detection: append full tag
                    const tagEnd = htmlContent.indexOf('>', i);
                    if (tagEnd !== -1) {
                        currentHtml += htmlContent.slice(i, tagEnd + 1);
                        i = tagEnd + 1;
                    } else {
                        currentHtml += char;
                        i++;
                    }
                } else if (char === '&') {
                    // Entity detection
                    const entityEnd = htmlContent.indexOf(';', i);
                    if (entityEnd !== -1 && entityEnd - i < 10) {
                        currentHtml += htmlContent.slice(i, entityEnd + 1);
                        i = entityEnd + 1;
                    } else {
                        currentHtml += char;
                        i++;
                    }
                } else {
                    // Regular char
                    currentHtml += char;
                    i++;
                }

                $element.html(currentHtml);

                const speed = Math.random() * 5 + 1 + baseSpeed;
                setTimeout(type, speed);
            } else {
                $element.removeClass('typewriter-cursor');
                if ($element.html() !== htmlContent) {
                    $element.html(htmlContent);
                }
            }
        }
        type();
    }
}
