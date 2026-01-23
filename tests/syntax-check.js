const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.join(__dirname, '../src');
let hasError = false;

function scan(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scan(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
            // Create a temporary .mjs file to force module parsing
            const tempFile = path.join(dir, `__syntax_check_${file}.mjs`);
            try {
                fs.copyFileSync(fullPath, tempFile);
                
                // Use node's --check flag on the .mjs file
                execSync(`node --check "${tempFile}"`, { stdio: 'pipe' });
                console.log(`✅  Syntax OK: ${path.relative(srcDir, fullPath)}`);
            } catch (error) {
                console.error(`❌  Syntax Error in: ${path.relative(srcDir, fullPath)}\n`);
                // Scrub the temp filename from output to avoid confusion
                let stderr = error.stderr ? error.stderr.toString() : error.message;
                stderr = stderr.replace(new RegExp(tempFile.replace(/\\/g, '\\\\'), 'g'), file);
                console.error(stderr);
                hasError = true;
            } finally {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            }
        }
    }
}

console.log('🔍 Starting syntax check (forcing Module mode)...\n');
scan(srcDir);

if (hasError) {
    console.log('\n❌  Checks failed. found syntax errors.');
    process.exit(1);
} else {
    console.log('\n✅  All JS files passed syntax check.');
}
