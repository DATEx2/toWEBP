const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
    try {
        // Ensure dist directory exists
        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }

        // 1. Bundle the Main App
        console.log('📦 Bundling App...');
        await esbuild.build({
            entryPoints: ['src/app.js'],
            bundle: true,
            minify: true, // Minify for production
            sourcemap: true,
            outfile: 'dist/bundle.js',
            target: ['es2020'], // Modern browsers
        });

        // 2. Bundle the Worker (Workers need to be separate files)
        console.log('👷 Bundling Worker...');
        await esbuild.build({
            entryPoints: ['src/worker.js'],
            bundle: true,
            minify: true,
            outfile: 'dist/worker.js',
            target: ['es2020']
        });

        // 3. Copy Static Assets (HTML, CSS, Libraries)
        console.log('📂 Copying Static Assets...');
        
        // Copy index.html
        let html = fs.readFileSync('src/index.html', 'utf8');
        // Update script reference to point to bundle.js
        // Remove translations.js script tag as it is now bundled
        html = html.replace('<script src="translations.js"></script>', '');
        // Update app type module to regular script if needed, or keep as module but pointing to bundle
        // Since we bundle, we can just use a normal script tag or module
        html = html.replace('type="module" src="app.js"', 'src="bundle.js" defer');
        
        fs.writeFileSync('dist/index.html', html);

        // Copy CSS
        if (fs.existsSync('src/styles.css')) {
            fs.copyFileSync('src/styles.css', 'dist/styles.css');
        }

        // Copy Libraries and Assets
        const assetsToCopy = [
            'sitemap.xml',
            'robots.txt',
            'manifest.json', // If exists
            'sw.js',         // If exists
            'favicon.svg',
            'favicon.webp',
            'web.config'     // IIS Config
        ];

        assetsToCopy.forEach(file => {
             if(fs.existsSync(`src/${file}`)) {
                 fs.copyFileSync(`src/${file}`, `dist/${file}`);
             }
        });

        console.log('✅ Build Complete!');

    } catch (e) {
        console.error('❌ Build Failed:', e);
        process.exit(1);
    }
}

build();
