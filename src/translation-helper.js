// Translation generator helper
// This file will be used to generate missing translations

const baseTranslations = {
    "app_name": "toWeb<span>P</span>.dev",
    "files": "files",
    "total_saved_header": "Total Saved: ",
    "download_zip": "Download ZIP",
    "clear": "Clear",
    "format": "Format",
    "quality": "Quality",
    "hero_title": "The best & fastest way to convert your images to WebP",
    "hero_subtitle": "Client side batch convert JPG, PNG, GIF, SVG, ICO, BMP, TIFF, HEIC, AVIF to WEBP.<br/><strong>100% free</strong>, <strong>instant</strong> - leveraging all your cores, unlimited in your browser.<br/><span class='secondary-text'>No uploads - <strong>Your files stay Private</strong> and no bandwidth needed</span><br/><span class='secondary-text'>No cookies - No tracking!</span>",
    "drag_drop": "Drag & Drop",
    "click_browse": "or click to browse",
    "feature_secure_title": "100% Secure & Private",
    "feature_secure_desc": "Unlike other tools, we run <strong>locally</strong>. Your images strictly never leave your device. No cloud uploads, no server storage, zero privacy risk.",
    "feature_fast_title": "Blazing Fast",
    "feature_fast_desc": "Utilize your computer's full power. Batch convert hundreds of JPEG, PNG, or AVIF images to WebP in seconds—faster than any server-side converter.",
    "feature_smart_title": "Smart Optimization",
    "feature_smart_desc": "Reduce file size by up to 80% while maintaining visual quality. Perfect for improving Core Web Vitals and SEO rankings for your own website.",
    "howto_title": "How to Convert Images to WebP",
    "step_1_title": "Upload or Drag & Drop",
    "step_1_desc": "Select your PNG, JPEG, or JPG images and drop them into the converter area.",
    "step_2_title": "Automatic Conversion",
    "step_2_desc": "ToWebP instantly processes your files locally using advanced browser technology.",
    "step_3_title": "Download & Save",
    "step_3_desc": "Download your optimized WebP files individually or as a ZIP archive.",
    "seo_comp_title": "Why Choose <strong>ToWebP.dev</strong> vs Others?",
    "seo_comp_desc": "Many converters upload your sensitive photos to a remote server. This creates a privacy risk and slows down the process with upload/download times. <strong>ToWebP.dev</strong> operates differently: it's a Progressive Web App (PWA) that processes images directly in your browser memory. This means military-grade privacy (the data never touches the internet) and instant speeds.",
    "seo_ranking_title": "WebP for Better SEO",
    "seo_ranking_desc": "Google explicitly favors fast-loading websites. Converting your PNGs and JPEGs to modern <strong>WebP format</strong> can significantly reduce page weight, improve LCP (Largest Contentful Paint), and boost your site's SEO ranking. <strong>ToWebP.dev</strong> is the perfect tool for web developers and designers to bulk optimize assets.",
    "faq_title": "Frequently Asked Questions",
    "faq_1_q": "Is my data safe?",
    "faq_1_a": "Yes, 100%. Unlike other converters, <strong>ToWebP.dev</strong> runs client-side. Your images never leave your computer.",
    "faq_2_q": "Can I convert images offline?",
    "faq_2_a": "Absolutely. <strong>ToWebP.dev</strong> is PWA-enabled. You can install it and use it without an internet connection.",
    "faq_3_q": "What formats are supported?",
    "faq_3_a": "We support converting from JPG, JPEG, PNG, BMP, and GIF (static) to <strong>WebP</strong> format.",
    "faq_4_q": "Is it free?",
    "faq_4_a": "Yes, <strong>ToWebP.dev</strong> is completely free with no daily limits or watermarks.",
    "why_use_title": "Why use <strong>ToWebP.dev</strong>?",
    "why_use_p1": "Because it is a privacy-first image converter that runs entirely in your browser.",
    "why_use_p2": "No Cookies, No Tracking. We believe in a clean and fast web. <br/>This site does not use persistent cookies or trackers, so you won't be pestered by consent banners. <br/>Just drag, drop, and convert with zero traces left behind.",
    "download": "DOWNLOAD",
    "buy_coffee": "Buy me a coffee",
    "gdpr_title": "100% GDPR Compliant & Worry Free",
    "gdpr_desc": "No Tracing. No Cookies. <br/> No Local Storage spying!<br/> We respect your User Rights by design. <br/> <strong>ToWebP.dev</strong> is a pure utility tool that does one thing well without collecting a single byte of your data.",
    "processing": "Processing...",
    "parsing_files": "Parsing files...",
    "waiting": "Waiting...",
    "total_saved_prefix": "Total Saved:",
    "saved": "saved",
    "starting": "Starting...",
    "select_language": "Select Language"
};

// Languages that need translations
const languagesToTranslate = [
    'nl', 'pl', 'uk', 'bg', 'el', 'hu', 'ja', 'zh', 'cs', 'da', 
    'sv', 'fi', 'ru', 'tr', 'et', 'hr', 'is', 'lt', 'lv', 'no', 'sk', 'sl'
];

console.log('Base translations:', Object.keys(baseTranslations).length);
console.log('Languages to translate:', languagesToTranslate.length);
