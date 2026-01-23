// Cache DOM elements
export const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    fileList: document.getElementById('file-list'),
    
    // Header Stickies
    headerStats: document.querySelector('.header-sticky-stats'),
    headerFilesCount: document.querySelector('.header-sticky-stats .files-count-display'),
    headerTotalSaved: document.querySelector('.header-sticky-stats .total-saved-pill'),
    headerDownloadBtn: document.getElementById('header-download-all'),
    headerClearBtn: document.getElementById('header-clear-all'),
    headerSizeStats: document.getElementById('header-size-stats'),
    
    // Main Controls
    downloadAllBtn: document.getElementById('download-all'), // Backup
    clearAllBtn: document.getElementById('clear-all'), // Backup
    qualityInput: document.getElementById('quality-slider'),
    qualityValue: document.getElementById('quality-value'),
    formatTabs: document.getElementById('format-tabs'),
    formatSelect: document.getElementById('format-select'),

    // Stats
    filesCountSpan: document.getElementById('files-count'),
    totalSavedSpan: document.getElementById('total-saved'),
    
    // Pie Chart
    pieChart: document.getElementById('pie-chart'),
    progressRing: document.getElementById('progress-ring'),
    progressCircleOuter: document.getElementById('progress-circle-outer'),
    progressCircleInner: document.getElementById('progress-circle-inner'),
    pieMainText: document.getElementById('pie-main-text'),
    pieSubText: document.getElementById('pie-sub-text'),
    pieDefaultContent: document.getElementById('pie-default-content'),
    pieActiveContent: document.getElementById('pie-active-content'),
    stickyParsing: document.getElementById('sticky-parsing'),
    stickyConversion: document.getElementById('sticky-conversion'),
    stickySaved: document.getElementById('sticky-saved'),
    
    // Stats Bar
    dropInitial: document.getElementById('drop-initial'),
    dropStats: document.getElementById('drop-stats'),

    // Carousel
    carouselSection: document.getElementById('carousel-section'),
    carouselTrack: document.getElementById('carousel-track'),
    carouselTrackContainer: document.getElementById('carousel-track-container'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),

    // App Container
    appContainer: document.querySelector('.app-container'),
    scrollSentinel: document.getElementById('scroll-sentinel'),

    // Templates
    fileItemTemplate: document.getElementById('file-item-template'),
    carouselTemplate: document.getElementById('carousel-card-template'),
    
    // Lightbox
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    lightboxCaption: document.getElementById('lightbox-caption'),
    lightboxClose: document.getElementById('lightbox-close'),
    lightboxNext: document.getElementById('lightbox-next'),
    lightboxPrev: document.getElementById('lightbox-prev')
};

// Aliases for backup buttons if needed
if (!elements.downloadAllBtn) elements.downloadAllBtn = elements.headerDownloadBtn;
if (!elements.clearAllBtn) elements.clearAllBtn = elements.headerClearBtn;
if (!elements.filesCountSpan) elements.filesCountSpan = elements.headerFilesCount;
if (!elements.totalSavedSpan) elements.totalSavedSpan = elements.headerTotalSaved;
