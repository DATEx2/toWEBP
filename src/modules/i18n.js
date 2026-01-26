import { translations } from '../translations.js';

let currentLang = 'en';

export const i18n = {
    apply: function(lang) {
        if (!translations[lang]) {
            console.warn(`Language '${lang}' not found, falling back to 'en'`);
            lang = 'en';
        }
        
        currentLang = lang;
        const t = translations[lang];
        
        // 1. Update HTML lang attribute
        document.documentElement.lang = lang;
        console.log(`[i18n] Language switched to: ${lang}`);

        // 2. Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) {
                el.innerHTML = t[key];
            }
        });
        
        // 3. Update page title
        if (t.hero_title) {
            const titleText = t.hero_title.replace(/<[^>]*>/g, '');
            document.title = `${titleText} - toWebP.dev`;
        }
        
        // 4. Update meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && t.hero_subtitle) {
            const descText = t.hero_subtitle.replace(/<[^>]*>/g, '').substring(0, 160);
            metaDesc.setAttribute('content', descText);
        }

        // 5. Update Open Graph tags for social media
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && t.hero_title) ogTitle.setAttribute('content', t.hero_title.replace(/<[^>]*>/g, ''));
        
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc && t.hero_subtitle) ogDesc.setAttribute('content', t.hero_subtitle.replace(/<[^>]*>/g, ''));
    },
    
    t: function(key) {
        const t = translations[currentLang];
        return t && t[key] ? t[key] : key;
    },
    
    getLang: function() {
        // Get browser language
        const browserLang = navigator.language || navigator.userLanguage;
        const langCode = browserLang.split('-')[0].toLowerCase();
        return translations[langCode] ? langCode : 'en';
    },
    
    getCurrentLang: function() {
        return currentLang;
    }
};

// Create a window fallback for compatibility if needed, 
// though we aim to remove this dependency
window.i18n = i18n;
window.translations = translations;


export async function initLanguageSystem() {
    const langBurger = document.getElementById('lang-burger');
    const langMenu = document.getElementById('lang-menu');
    const closeBtn = document.getElementById('close-lang-menu-btn');
    const langOptions = document.querySelectorAll('.lang-option');

    let detectedLang = await detectLanguage();
    
    i18n.apply(detectedLang);
    updateActiveLang(detectedLang);

    initTypewriter();

    if (!langBurger || !langMenu) {
        return;
    }

    // Close on backdrop click (Mobile Bottom Sheet)
    langMenu.addEventListener('click', (e) => {
        if (e.target === langMenu) {
             langMenu.classList.add('hidden');
             document.documentElement.style.overflow = '';
             document.body.style.overflow = '';
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            langMenu.classList.add('hidden');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        });
    }

    langBurger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); 
        const isHidden = langMenu.classList.contains('hidden');
        if (isHidden) {
            langMenu.classList.remove('hidden');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        } else {
            langMenu.classList.add('hidden');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        }
    });

    document.addEventListener('click', (e) => {
        if (langMenu && !langMenu.classList.contains('hidden')) {
            if (!langMenu.contains(e.target) && !langBurger.contains(e.target)) {
                langMenu.classList.add('hidden');
                document.documentElement.style.overflow = '';
                document.body.style.overflow = '';
            }
        }
    });

    function updateSEOTags(lang) {
        // 1. Update HTML lang attribute
        document.documentElement.lang = lang;

        // 2. Update Canonical URL
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        const url = new URL(window.location);
        url.searchParams.set('lang', lang);
        canonical.href = url.href;

        // 2.1 Update Logo Link
        const logoLink = document.getElementById('logo-link');
        if (logoLink) {
            const logoUrl = new URL(window.location.origin + window.location.pathname);
            logoUrl.searchParams.set('lang', lang);
            logoLink.href = logoUrl.href;
        }

        // 3. Update Alternate Hreflang Tags (for all supported langs)
        // Remove existing alternates to avoid dupes
        document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());
        
        const baseUrl = window.location.origin + window.location.pathname;
        Object.keys(translations).forEach(code => {
            const link = document.createElement('link');
            link.rel = 'alternate';
            link.hreflang = code;
            link.href = `${baseUrl}?lang=${code}`;
            document.head.appendChild(link);
        });
        // x-default
        const xDefault = document.createElement('link');
        xDefault.rel = 'alternate';
        xDefault.hreflang = 'x-default';
        xDefault.href = baseUrl; // Default to English/Root without param
        document.head.appendChild(xDefault);
    }

    langOptions.forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.lang;
            i18n.apply(lang);
            localStorage.setItem('towebp_language', lang);
            updateActiveLang(lang);
            
            // Update URL without reload
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('lang', lang);
            window.history.pushState({path: newUrl.href}, '', newUrl.href);
            
            updateSEOTags(lang); // Update SEO tags

            langMenu.classList.add('hidden');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        });
    });

    // Initial SEO Update
    setTimeout(() => updateSEOTags(detectedLang), 100);

    function updateActiveLang(lang) {
        langOptions.forEach(opt => {
            if (opt.dataset.lang === lang) opt.classList.add('active');
            else opt.classList.remove('active');
        });
    }
}

async function detectLanguage() {
    // 1. Check URL param (Highest Priority for SEO/Sharing)
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && translations && translations[urlLang]) {
        return urlLang;
    }

    // 2. Check LocalStorage
    const savedLang = localStorage.getItem('towebp_language');
    if (savedLang && translations && translations[savedLang]) {
        return savedLang;
    }

    try {
        const response = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(3000) });
        const text = await response.text();
        const match = text.match(/loc=([A-Z]{2})/);
        const countryCode = match ? match[1].toLowerCase() : null;
        
        const countryToLang = {
            'ro': 'ro', 'md': 'ro',
            'fr': 'fr', 'be': 'fr', 'ch': 'fr',
            'de': 'de', 'at': 'de',
            'es': 'es', 'mx': 'es', 'ar': 'es', 'co': 'es',
            'it': 'it', 'pt': 'pt', 'br': 'pt', 'nl': 'nl',
            'gr': 'el', 'hu': 'hu', 'pl': 'pl',
            'sa': 'ar', 'ae': 'ar', 'eg': 'ar',
            'bg': 'bg', 'jp': 'ja', 'cn': 'zh', 'tw': 'zh'
        };
        const detected = countryToLang[countryCode];
        if (detected && translations && translations[detected]) return detected;
    } catch (e) {}

    const browserLang = i18n.getLang();
    if (translations && translations[browserLang]) return browserLang;

    return 'en';
}

export function initTypewriter() {
    const h2 = document.querySelector('.hero-section h2');
    const p = document.querySelector('.hero-section p');
    
    // Elements to reveal after hero text finishes
    const finalRevealElements = document.querySelectorAll('.drop-zone, .info-section');
    
    // Ensure initial state is hidden to prevent FOUC (though HTML should have opacity:0 too)
    if (p) p.style.opacity = '1'; 
    finalRevealElements.forEach(e => {
        e.style.opacity = '0';
        e.style.transition = 'opacity 0.8s ease-out';
    });

    if (!h2 || !p) return;

    function getTranslatedText(element, fallbackKey) {
        const key = element.getAttribute('data-i18n') || fallbackKey;
        if (!key) return element.innerHTML;

        const currentLang = i18n.getCurrentLang();
        const translation = translations[currentLang] ? translations[currentLang][key] : null;
        
        if (translation) {
            return translation;
        } else {
            console.warn(`[i18n] Missing translation for key: "${key}" in language: "${currentLang}". Using HTML fallback.`);
        }
        return element.innerHTML;
    }

    // Capture text from translations (priority) or HTML (fallback)
    const textH2 = getTranslatedText(h2, 'hero_title');
    const textP = getTranslatedText(p, 'hero_subtitle');
    
    h2.innerHTML = '';
    p.innerHTML = '';
    h2.classList.add('typewriter-cursor');

    // Pre-clear Info Cards and store their translated text
    const cards = document.querySelectorAll('.info-card');
    cards.forEach(card => {
        const h3 = card.querySelector('h3');
        const pTag = card.querySelector('p');
        if(h3) {
            h3.dataset.text = getTranslatedText(h3);
            h3.textContent = '';
        }
        if(pTag) {
            pTag.dataset.text = getTranslatedText(pTag);
            pTag.textContent = '';
        }
    });

    function typeLinePromise(element, text) {
        return new Promise(resolve => {
            let i = 0;
            element.innerHTML = ''; 
            
            function type() {
                if (i < text.length) {
                    if (text.charAt(i) === '<') {
                        let tagEnd = text.indexOf('>', i);
                        if (tagEnd !== -1) {
                            element.innerHTML += text.substring(i, tagEnd + 1);
                            i = tagEnd + 1;
                        } else {
                            element.innerHTML += text.charAt(i);
                            i++;
                        }
                    } else {
                        element.innerHTML += text.charAt(i);
                        i++;
                    }

                    if (text.charAt(i - 1) === ' ') setTimeout(type, 15);
                    else setTimeout(type, Math.random() * 3 + 2);
                } else {
                    resolve();
                }
            }
            type();
        });
    }

    setTimeout(() => {
        h2.classList.add('typewriter-cursor');
        p.classList.add('typewriter-cursor');

        // Reveal Drop Zone
        const dropZone = document.querySelector('.drop-zone');
        if (dropZone) dropZone.style.opacity = '1';
        
        // Reveal Info Section after a delay
        setTimeout(() => {
            const infoSection = document.querySelector('.info-section');
            if (infoSection) {
                setTimeout(t=>infoSection.style.opacity = '1', 100);
                setupInfoCardsObserver();
            }
        }, 10);

        // Start typing Header
        Promise.all([
            typeLinePromise(h2, textH2).then(() => h2.classList.remove('typewriter-cursor')),
            typeLinePromise(p, textP).then(() => p.classList.remove('typewriter-cursor'))
        ]);
    }, 5);

    function setupInfoCardsObserver() {
        const cards = document.querySelectorAll('.info-card');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const card = entry.target;
                    typeCard(card);
                    observer.unobserve(card);
                }
            });
        }, { threshold: 0.1 });
        
        cards.forEach(card => observer.observe(card));
    }

    function typeCard(card) {
        const typeHelper = (element, text) => typeLinePromise(element, text);
        
        const h3 = card.querySelector('h3');
        const p = card.querySelector('p');
        if (!h3 || !p) return;

        // Retrieve stored text
        const h3Text = h3.dataset.text || '';
        const pText = p.dataset.text || '';

        h3.style.visibility = 'visible';
        p.style.visibility = 'visible';

        // Type title and paragraph in parallel for speed
        typeHelper(h3, h3Text);
        typeHelper(p, pText);
    }
}
