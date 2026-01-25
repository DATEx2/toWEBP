
/**
 * Handles Scroll Reveal and Typewriter effects for SEO content
 */

export function initScrollReveal() {
    const observerOptions = {
        root: null,
        rootMargin: '-10px', // Trigger slightly before element enters viewport
        threshold: 0.1
    };

    function getTranslatedText(el) {
        const key = el.getAttribute('data-i18n');
        if (!key) return el.innerHTML;

        if (window.i18n && window.translations) {
            const currentLang = window.i18n.getCurrentLang ? window.i18n.getCurrentLang() : 'en';
            const translation = window.translations[currentLang] ? window.translations[currentLang][key] : null;
            
            if (translation) {
                return translation;
            } else {
                console.warn(`[ScrollReveal] Missing translation for key: "${key}" in language: "${currentLang}". Using HTML fallback.`);
            }
        }
        return el.innerHTML;
    }

    // Pre-process elements: Hide text content immediately to prevent "already typed" flash
    $('.scroll-reveal .type-target').each(function() {
        const el = this;
        const $el = $(el);
        if (!$el.data('originalHtml')) {
            // Priority: Translation File > Current DOM content
            const content = getTranslatedText(el);
            $el.data('originalHtml', content);
            $el.html('');
            $el.css('visibility', 'hidden'); 
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
                            startTyping($target, content, Math.random() * 2 + 1);
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
                    // Regular char - sometimes burst a whole word
                    // 15% chance to type until next space, provided no tags intervene
                    if (Math.random() < 0.15) {
                        const nextSpace = htmlContent.indexOf(' ', i);
                        const nextTag = htmlContent.indexOf('<', i);
                        
                        // If we have a space, and it's closer than the next tag (or no tag exists)
                        if (nextSpace !== -1 && (nextTag === -1 || nextSpace < nextTag)) {
                            // Valid word burst opportunity
                            const wordChunk = htmlContent.slice(i, nextSpace + 1); // include the space
                            currentHtml += wordChunk;
                            i += wordChunk.length;
                        } else {
                            currentHtml += char;
                            i++;
                        }
                    } else {
                        currentHtml += char;
                        i++;
                    }
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
