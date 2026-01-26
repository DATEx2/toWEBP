import { translations } from '../translations.js';
import { i18n } from './i18n.js';

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

        const currentLang = i18n.getCurrentLang();
        const translation = translations[currentLang] ? translations[currentLang][key] : null;
        
        if (translation) {
            return translation;
        } else {
            console.warn(`[ScrollReveal] Missing translation for key: "${key}" in language: "${currentLang}". Using HTML fallback.`);
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
                const $typeTargets = $el.find('.type-target');
                setTimeout(t => {
                    if ($typeTargets.length > 0) {
                        $typeTargets.each(function() {
                            const $target = $(this);
                            // Lock height to prevent collapse
                            const currentHeight = $target.outerHeight();
                            $target.css('min-height', currentHeight + 'px');
                            
                            $target.html(''); 
                            $target.css('visibility', 'visible');
                        });
                    } 
                    $el.addClass('visible');
                    setTimeout(t => {
                        $typeTargets.each(function() {
                            const content = getTranslatedText(this);
                            startTyping($(this), content, Math.random() * 1 + 1);
                        });
                    }, 200);
                }, 50);

            } 
        });
    }, observerOptions);

    $('.scroll-reveal').each(function() {
        observer.observe(this);
    });

    function startTyping($element, htmlContent, baseSpeed = 0) {
        // Add cursor
        $element.addClass('typewriter-cursor');

        // Calculate Speed Factor based on length
        // Scale: <10: 6, <20: 5, <30: 4, <40: 3, <60: 2, >=60: 1
        const textLen = htmlContent.replace(/<[^>]*>/g, '').length;
        let speedFactor = 1;
        if (textLen < 20) speedFactor = 8;
        else if (textLen < 30) speedFactor = 7;
        else if (textLen < 40) speedFactor = 6;
        else if (textLen < 50) speedFactor = 5;
        else if (textLen < 60) speedFactor = 4;
        else if (textLen < 70) speedFactor = 3;
        else if (textLen < 80) speedFactor = 2.5;
        else if (textLen < 90) speedFactor = 2;
        else if (textLen < 100) speedFactor = 1.5;
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

                // Calculate delay using speedFactor
                // Base: 1-6ms. Multiplied by factor (1-6).
                // Factor 1 (Fast): 1-6ms
                // Factor 6 (Slow): 6-36ms
                const variance = Math.random() * 5 + 1;
                const speed = (variance + baseSpeed) * speedFactor;
                
                setTimeout(type, speed);
            } else {
                $element.removeClass('typewriter-cursor');
                if ($element.html() !== htmlContent) {
                    $element.html(htmlContent);
                }
                // Unlock height
                $element.css('min-height', '');
            }
        }
        type();
    }
}
