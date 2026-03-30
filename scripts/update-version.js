const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootVersionPath = path.join(__dirname, '..', 'version.json');
let fallbackVersion = '5.2.3';
try {
  if (fs.existsSync(rootVersionPath)) {
    const data = JSON.parse(fs.readFileSync(rootVersionPath, 'utf8'));
    if (data.version) fallbackVersion = data.version;
  }
} catch(e) {}

try {
    // Get last commit message
    const commitMsg = execSync('git log -1 --pretty=%B').toString().trim();
    console.log('Last commit message:', commitMsg);
    
    // Extract vX.X.X pattern
    const match = commitMsg.match(/v(\d+\.\d+\.\d+)/);
    const version = match ? match[1] : fallbackVersion; 
    
    console.log('Target version:', version);
    
    const content = JSON.stringify({ version }, null, 2);
    
    fs.writeFileSync(rootVersionPath, content);
    fs.writeFileSync(path.join(__dirname, '..', 'frontend', 'version.json'), content);
    fs.writeFileSync(path.join(__dirname, '..', 'server', 'version.json'), content);
    
    console.log('Successfully updated version.json in all locations.');
} catch (e) {
    console.warn('Git not available or error occurred. Keeping existing version:', fallbackVersion);
    const content = JSON.stringify({ version: fallbackVersion }, null, 2);
    try {
        fs.writeFileSync(rootVersionPath, content);
        fs.writeFileSync(path.join(__dirname, '..', 'frontend', 'version.json'), content);
        fs.writeFileSync(path.join(__dirname, '..', 'server', 'version.json'), content);
    } catch (err) {}
}
