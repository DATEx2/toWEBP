export function initAnalytics() {
    const hostname = window.location.hostname;
    let token = null;

    if (hostname === 'towebp.dev') {
        token = '5b57c5d7410f438ea67d0ccf13d0381d'; 
    } else if (hostname === 'towebp.datex2.bike') {
        token = '1de9ede71846401fb79e6753263b7dcc'; 
    }

    if (token) {
        const script = document.createElement('script');
        script.defer = true;
        script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        script.setAttribute('data-cf-beacon', `{"token": "${token}"}`);
        document.body.appendChild(script);
    }
}
