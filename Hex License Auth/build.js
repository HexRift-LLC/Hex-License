const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const sourceDir = __dirname;
const buildDir = path.join(__dirname, 'release');

// Ensure the build directory exists
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

// Function to obfuscate JavaScript files
const obfuscateFile = (filePath, outputPath) => {
    const code = fs.readFileSync(filePath, 'utf-8');
    const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 1
    }).getObfuscatedCode();

    fs.writeFileSync(outputPath, obfuscatedCode);
};

// Directories to obfuscate (JS files only)
const jsDirs = ['src', 'config'];

// Function to process directories
const processDirectory = (dir, baseOutputDir) => {
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);

        // Ensure the output path remains inside 'release' without creating extra 'release' dirs
        let relativePath = path.relative(sourceDir, filePath);
        if (relativePath.startsWith('release')) return; // Skip already processed release files

        const outputPath = path.join(baseOutputDir, relativePath);

        if (fs.statSync(filePath).isDirectory()) {
            if (!filePath.includes('node_modules') && !filePath.includes('release')) {
                fs.mkdirSync(outputPath, { recursive: true });
                processDirectory(filePath, baseOutputDir);
            }
        } else if (file.endsWith('.js') && jsDirs.some(d => filePath.includes(d))) {
            obfuscateFile(filePath, outputPath);
        } else {
            // Copy non-JS files as they are
            fs.copyFileSync(filePath, outputPath);
        }
    });
};

// Start processing
processDirectory(sourceDir, buildDir);

console.log('Build complete. Obfuscated files are in the "release" folder.');
