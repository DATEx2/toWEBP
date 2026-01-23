export async function initLanguageSystem() {
    const langBurger = document.getElementById('lang-burger');
    const langMenu = document.getElementById('lang-menu');
    const langOptions = document.querySelectorAll('.lang-option');

    let detectedLang = await detectLanguage();
    
    if (window.i18n) {
        window.i18n.apply(detectedLang);
    }
    updateActiveLang(detectedLang);

    initTypewriter();

    if (!langBurger || !langMenu) {
        console.error("Critical: Lang elements missing", { langBurger, langMenu });
        return;
    }

    langBurger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); 
        const isHidden = langMenu.classList.contains('hidden');
        if (isHidden) {
            langMenu.classList.remove('hidden');
        } else {
            langMenu.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (langMenu && !langMenu.classList.contains('hidden')) {
            if (!langMenu.contains(e.target) && !langBurger.contains(e.target)) {
                langMenu.classList.add('hidden');
            }
        }
    });

    langOptions.forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.lang;
            if (window.i18n) window.i18n.apply(lang);
            localStorage.setItem('towebp_language', lang);
            updateActiveLang(lang);
            langMenu.classList.add('hidden');
        });
    });

    function updateActiveLang(lang) {
        langOptions.forEach(opt => {
            if (opt.dataset.lang === lang) opt.classList.add('active');
            else opt.classList.remove('active');
        });
    }
}

async function detectLanguage() {
    const savedLang = localStorage.getItem('towebp_language');
    if (savedLang && window.translations && window.translations[savedLang]) {
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
        if (detected && window.translations && window.translations[detected]) return detected;
    } catch (e) {}

    if (window.i18n) {
        const browserLang = window.i18n.getLang();
        if (window.translations && window.translations[browserLang]) return browserLang;
    }
    return 'en';
}

export function initTypewriter() {
    const h2 = document.querySelector('.hero-section h2');
    const p = document.querySelector('.hero-section p');

    if (!h2 || !p) return;

    const finalRevealElements = document.querySelectorAll('.drop-zone, .info-section');
    p.style.opacity = '1'; 
    finalRevealElements.forEach(e => {
        e.style.opacity = '0';
        e.style.transition = 'opacity 0.8s ease-out';
    });

    const textH2 = h2.textContent;
    const textP = p.textContent;

    h2.textContent = '';
    p.textContent = '';
    h2.classList.add('typewriter-cursor');

    function typeLinePromise(element, text) {
        return new Promise(resolve => {
            let i = 0;
            function type() {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
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

        const dropZone = document.querySelector('.drop-zone');
        if (dropZone) dropZone.style.opacity = '1';
        
        setTimeout(() => {
            const infoSection = document.querySelector('.info-section');
            if (infoSection) {
                infoSection.style.opacity = '1';
                startInfoCardsTyping();
            }
        }, 1000);

        Promise.all([
            typeLinePromise(h2, textH2).then(() => h2.classList.remove('typewriter-cursor')),
            typeLinePromise(p, textP).then(() => p.classList.remove('typewriter-cursor'))
        ]);
    }, 5);

    function startInfoCardsTyping() {
        const cards = document.querySelectorAll('.info-card');
        const typeHelper = (element, text) => typeLinePromise(element, text);

        cards.forEach((card, index) => {
            setTimeout(() => {
                const h3 = card.querySelector('h3');
                const p = card.querySelector('p');
                if (!h3 || !p) return;

                const h3Text = h3.textContent;
                const pText = p.textContent;

                h3.textContent = '';
                p.textContent = '';
                h3.style.visibility = 'visible';
                p.style.visibility = 'visible';

                typeHelper(h3, h3Text).then(() => typeHelper(p, pText));
            }, index * 400);
        });
    }
}
