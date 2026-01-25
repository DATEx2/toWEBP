// Cache DOM elements
export const elements = {
    dropZone: $('#drop-zone'),
    fileInput: $('#file-input'),
    fileList: $('#file-list'),
    
    // Header Stickies
    headerStats: $('.header-sticky-stats'),
    headerFilesCount: $('.header-sticky-stats .files-count-display'),
    headerTotalSaved: $('.header-sticky-stats .total-saved-pill'),
    headerDownloadBtn: $('#header-download-all'),
    headerClearBtn: $('#header-clear-all'),
    headerSizeStats: $('#header-size-stats'),
    
    // Main Controls
    downloadAllBtn: $('#download-all'), // Backup
    clearAllBtn: $('#clear-all'), // Backup
    qualityInput: $('#quality-slider'),
    qualityValue: $('#quality-value'),
    formatTabs: $('#format-tabs'),
    formatSelect: $('#format-select'),

    // Stats
    filesCountSpan: $('#files-count'),
    totalSavedSpan: $('#total-saved'),
    
    // Pie Chart
    pieChart: $('#pie-chart'),
    progressRing: $('#progress-ring'),
    progressCircleOuter: $('#progress-circle-outer'),
    progressCircleInner: $('#progress-circle-inner'),
    pieMainText: $('#pie-main-text'),
    pieSubText: $('#pie-sub-text'),
    pieDefaultContent: $('#pie-default-content'),
    pieActiveContent: $('#pie-active-content'),
    stickyParsing: $('#sticky-parsing'),
    stickyConversion: $('#sticky-conversion'),
    stickySaved: $('#sticky-saved'),
    
    // Stats Bar
    dropInitial: $('#drop-initial'),
    dropStats: $('#drop-stats'),

    // Carousel
    carouselSection: $('#carousel-section'),
    carouselTrack: $('#carousel-track'),
    carouselTrackContainer: $('#carousel-track-container'),
    prevBtn: $('#prev-btn'),
    nextBtn: $('#next-btn'),

    // App Container
    appContainer: $('.app-container'),
    scrollSentinel: $('#scroll-sentinel'),

    // Templates
    fileItemTemplate: $('#file-item-template'),
    carouselTemplate: $('#carousel-card-template'),
    
    // Lightbox
    lightbox: $('#lightbox'),
    lightboxImg: $('#lightbox-img'),
    lightboxCaption: $('#lightbox-caption'),
    lightboxClose: $('#lightbox-close'),
    lightboxDownload: $('#lightbox-download'),
    lightboxNext: $('#lightbox-next'),
    lightboxPrev: $('#lightbox-prev')
};

// Aliases for backup buttons if needed
if (!elements.downloadAllBtn) elements.downloadAllBtn = elements.headerDownloadBtn;
if (!elements.clearAllBtn) elements.clearAllBtn = elements.headerClearBtn;
if (!elements.filesCountSpan) elements.filesCountSpan = elements.headerFilesCount;
if (!elements.totalSavedSpan) elements.totalSavedSpan = elements.headerTotalSaved;
