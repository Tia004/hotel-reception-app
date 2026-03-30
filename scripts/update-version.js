const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
    // Get last commit message
    const commitMsg = execSync('git log -1 --pretty=%B').toString().trim();
    console.log('Last commit message:', commitMsg);
    
    // Extract vX.X.X pattern
    const match = commitMsg.match(/v(\d+\.\d+\.\d+)/);
    const version = match ? match[1] : '5.2.3'; // Fallback to current if not found
    
    console.log('Target version:', version);
    
    const content = JSON.stringify({ version }, null, 2);
    
    // Root version (for reference)
    fs.writeFileSync(path.join(__dirname, '..', 'version.json'), content);
    
    // Frontend version
    fs.writeFileSync(path.join(__dirname, '..', 'frontend', 'version.json'), content);
    
    // Server version
    fs.writeFileSync(path.join(__dirname, '..', 'server', 'version.json'), content);
    
    console.log('Successfully updated version.json in all locations.');
} catch (e) {
    console.warn('Git not available or error occurred. Using fallback.');
    const fallback = JSON.stringify({ version: '5.2.3' }, null, 2);
    try {
        fs.writeFileSync(path.join(__dirname, '..', 'version.json'), fallback);
        fs.writeFileSync(path.join(__dirname, '..', 'frontend', 'version.json'), fallback);
        fs.writeFileSync(path.join(__dirname, '..', 'server', 'version.json'), fallback);
    } catch (err) {}
}
