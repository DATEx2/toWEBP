export const state = {
    // Core Processing
    queue: [],          // Array of file objects waiting to be processed
    processing: new Map(), // Map of active job IDs {id: {startTime}}
    completed: new Map(),  // Map of completed results {id: {blob, fileName, ...}}
    workers: [],        // Array of Worker objects
    workerStatus: [],   // Array of booleans (true = busy)
    originalOrder: new Map(), // Map of {id: originalIndex} for sorting
    
    // Core Settings
    quality: 80,
    format: 'image/webp',
    
    // Counters & IDs
    nextId: 1,
    totalFilesCount: 0,
    parsingTarget: 0, // Total files expected after parsing
    
    // Performance & Stats
    totalOriginalSize: 0,
    grandTotalInputSize: 0,
    totalNewSize: 0,
    sessionDiff: 0,

    // UI State
    pendingRowUpdates: [], // Batch of updates for the UI loop
    carouselQueue: [],     // Batch of new card items
    renderDirty: false,    // Signal to re-render visuals
    
    // Deduplication & Reprocessing
    loadedFiles: [],       // Archive of all input files
    fileSignatures: new Set(),
    lastRunLookup: new Map(), // { fileName: size } for diffs

    // Visual Interpolation
    parsingCompleteTime: null,
    visual: {
        innerProgress: 0,
        innerTarget: 0,
        outerProgress: 0,
        outerTarget: 0
    },

    // Throttled Parsing State
    parsing: {
        active: false,
        fileArray: [],
        index: 0,
        resume: null
    }
};

// Worker Initialization
export function initWorkers(workerCount) {
    console.log(`Initializing ${workerCount} workers...`);
    for (let i = 0; i < workerCount; i++) {
        const worker = new Worker('src/worker.js'); // Path relative to index.html
        state.workers.push(worker);
        state.workerStatus.push(false); // Idle
    }
}

export function resetState() {
    state.completed.clear();
    state.processing.clear();
    state.originalOrder.clear();
    state.queue = [];
    state.fileSignatures.clear();
    state.pendingRowUpdates = [];
    state.carouselQueue = [];
    state.totalFilesCount = 0;
    state.totalOriginalSize = 0;
    state.grandTotalInputSize = 0;
    state.totalNewSize = 0;
    state.sessionDiff = 0;
    state.parsingTarget = 0;
    
    state.visual.innerProgress = 0;
    state.visual.innerTarget = 0;
    state.visual.outerProgress = 0;
    state.visual.outerTarget = 0;
}
