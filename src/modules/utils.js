export function formatSize(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes)) return '0 B';
    if (bytes === 0) return '0 B';

    const isNegative = bytes < 0;
    const absBytes = Math.abs(bytes);

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(absBytes) / Math.log(k));

    let val, unit;
    if (i < 0) {
        val = absBytes;
        unit = 'B';
    } else if (i >= sizes.length) {
        const last = sizes.length - 1;
        val = parseFloat((absBytes / Math.pow(k, last)).toFixed(1));
        unit = sizes[last];
    } else {
        val = parseFloat((absBytes / Math.pow(k, i)).toFixed(1));
        unit = sizes[i];
    }

    return (isNegative ? '-' : '') + val + ' ' + unit;
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
