const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('iframe.contentWindow');
stealthPlugin.enabledEvasions.delete('navigator.plugins');
puppeteer.use(stealthPlugin);

async function loadSessionData(page, sessionFilePath) {
    const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));

    await page.setCookie(...sessionData.cookies);

    await page.evaluate((localStorageData) => {
        Object.keys(localStorageData).forEach(key => {
            localStorage.setItem(key, localStorageData[key]);
        });
    }, sessionData.localStorageData);
}

async function saveSessionData(page, sessionFilePath) {
    const cookies = await page.cookies();
    const localStorageData = await page.evaluate(() => {
        let data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    });

    fs.writeFileSync(sessionFilePath, JSON.stringify({ cookies, localStorageData }));
    console.log("Session data saved.");
}

async function getCookies(url, application_name) {
    try {
        // Launch the browser in non-headless mode
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            ignoreDefaultArgs: ['--enable-automation', '--disable-extensions', '--disable-default-apps', '--disable-component-extensions-with-background-pages'],
            defaultViewport: null
        });

        // Open a new page and navigate to TikTok's upload URL
        const page = await browser.newPage();
        await page.setBypassCSP(true)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

        await page.goto(url, {
            waitUntil: 'networkidle2'
        });

        console.log("Waiting for 120 seconds...");
        await new Promise(resolve => setTimeout(resolve, 120000));

        await saveSessionData(page, `${application_name}_cookies.json`);
        console.log("Session data saved.");

    } catch (error) {
        console.error('Error posting to Youtube:', error);
    }
}

async function PostToTiktok(filePath) {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/chromium-browser',
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const page = await browser.newPage();

        await page.goto('https://tiktok.com/login', {
            waitUntil: 'networkidle2'
        });

        console.log('Injecting cookies')
        const cookiesPath = path.join(__dirname, '..', '..', 'Cookies', 'tiktok_cookies.json')
        await loadSessionData(page, cookiesPath);
        console.log('Injected.')

        await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=upload', {
            waitUntil: 'networkidle2'
        });

        const inputFile = await page.waitForSelector('input[type="file"]', {
            visible: false, // File inputs are typically hidden
            timeout: 30000  // 30 second timeout
        });

        if (inputFile) {
            await inputFile.uploadFile(filePath);
            console.log('Waiting for file upload to complete...');

            try {
                const progressMonitor = setInterval(async () => {
                    try {
                        const progressElement = await page.$('div.jsx-305849304.info-progress-num');
                        if (progressElement) {
                            const progressText = await progressElement.evaluate(el => el.textContent);
                            console.log(`Upload progress: ${progressText}`);

                            if (progressText === '100%') {
                                clearInterval(progressMonitor);
                                console.log('Upload completed successfully');
                            }
                        }
                    } catch (error) {
                        // Silently fail if element isn't found yet
                    }
                }, 1000);

                await Promise.race([
                    // Check for "Uploaded" text
                    page.waitForSelector('span.TUXText.TUXText--tiktok-sans:contains("Uploaded")', {
                        visible: true,
                        timeout: 120000
                    }),


                    // Check for 100% progress
                    page.waitForSelector('div.jsx-305849304.info-progress-num', {
                        visible: true,
                        timeout: 120000
                    }).then(async (element) => {
                        await page.waitForFunction(
                            (el) => el.textContent === '100%',
                            { timeout: 120000 },
                            element
                        );
                    })
                ]);

            } catch (error) {
                console.error('Upload verification failed:', error);
                throw new Error('Upload verification timeout - upload may not have completed successfully');
            }
        } else {
            console.log("File input element not found.");
            throw new Error("File input element not found");
        }

        // await new Promise(resolve => setTimeout(resolve, 15000));
        await page.waitForSelector('.public-DraftEditor-content');
        await page.click('.public-DraftEditor-content');

        await page.keyboard.down('Control');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('A');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.up('Control');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('Backspace');

        await new Promise(resolve => setTimeout(resolve, 500));

        const caption = `Follow for more news content like these.`;

        // Type message with human-like delays
        await page.evaluate((text) => navigator.clipboard.writeText(text), caption);
        await page.keyboard.down('Control');
        await page.keyboard.press('V');
        await page.keyboard.up('Control');

        await new Promise(resolve => setTimeout(resolve, 500));
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.keyboard.press('Tab');
        await new Promise(resolve => setTimeout(resolve, 500));

        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('ArrowDown');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Wait for the 'Post' button to appear and click it
        await page.waitForSelector(`.TUXButton.TUXButton--default.TUXButton--large.TUXButton--primary`, { visible: true });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const postButtonSelector = '.TUXButton.TUXButton--default.TUXButton--large.TUXButton--primary';
        await page.evaluate((postButtonSelector) => {
            const createButton = Array.from(document.querySelectorAll(postButtonSelector))
                .find(element => element.textContent.includes('Post'));
            if (createButton) {
                createButton.click();
            } else {
                console.log('Post button not found.');
            }
        }, postButtonSelector);

        await new Promise(resolve => {
            const randomDelay = Math.floor(Math.random() * (60000 - 45000 + 1)) + 45000;
            setTimeout(resolve, randomDelay);
        });

        browser.close();

    } catch (error) {
        console.error('Error posting to TikTok:', error);
    }
}

module.exports = { PostToTiktok, getCookies };