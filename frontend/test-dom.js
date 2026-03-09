const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.log('LOG-ERROR:', msg.text()); });
    page.on('pageerror', err => console.log('PAGE-ERROR:', err.message));
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 4000));
    const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML);
    fs.writeFileSync('/tmp/root.html', rootHtml);
    console.log('done writing');
  } catch (e) {
    console.error('SCRIPT ERR:', e);
  }
  await browser.close();
})();
