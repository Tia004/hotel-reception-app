const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    try {
        const page = await browser.newPage();
        page.on('console', msg => { if (msg.type() === 'error') console.log('LOG-ERROR:', msg.text()); });
        page.on('pageerror', err => console.log('PAGE-ERROR:', err.message));
        await page.goto('http://localhost:8081', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 4000));

        // Type username and login to enter HotelChat
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            const usrInput = inputs[0];
            const pwdInput = inputs[1];
            // We can't type easily without puppeteer page.type, let's just use page.type
        });
        await page.type('input[placeholder="Inserisci ID postazione"]', 'admin');
        await page.type('input[placeholder="Inserisci password"]', 'password123');

        const buttons = await page.$x('//div[contains(text(), "ACCEDI")]/ancestor::div[@role="button"]');
        if (buttons.length > 0) {
            await buttons[0].click();
        }

        await new Promise(r => setTimeout(r, 4000));
        console.log('done testing App');
    } catch (e) {
        console.error('SCRIPT ERR:', e);
    }
    await browser.close();
})();
