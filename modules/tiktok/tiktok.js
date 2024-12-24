const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const { connect } = require('puppeteer-real-browser');
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

async function getTiktokCookies(url, application_name) {
    try {
        // Launch the browser in non-headless mode
        const { browser, page } = await connect({
            headless: false,
            turnstile: true, // Optional: helps bypass Cloudflare challenges

            // executablePath: '/usr/bin/chromium-browser',
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            fingerprint: true, // Optional: generates a more realistic browser fingerprint
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        });

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
        const { browser, page } = await connect({
            headless: false,
            turnstile: true, // Optional: helps bypass Cloudflare challenges

            // executablePath: '/usr/bin/chromium-browser',
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            fingerprint: true, // Optional: generates a more realistic browser fingerprint
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        });

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

        // if (inputFile) {
        //     await inputFile.uploadFile(filePath);
        //     console.log('Waiting for file upload to complete...');


        //     try {
        //         const progressMonitor = setInterval(async () => {

        //             // class="jsx-1979214919 info-progress-num info"

        //             try {
        //                 const progressElement = await page.$('div.info-progress-num');
        //                 if (progressElement) {
        //                     const progressText = await progressElement.evaluate(el => el.textContent);
        //                     console.log(`Upload progress: ${progressText}`);

        //                     if (progressText === '100%') {
        //                         clearInterval(progressMonitor);
        //                         console.log('Upload completed successfully');
        //                     }
        //                 }
        //             } catch (error) {
        //                 // Silently fail if element isn't found yet
        //                 console.log('No upload data found.');
        //             }
        //         }, 1000);

        //         await Promise.race([
        //             // Check for "Uploaded" text
        //             page.waitForSelector('span.TUXText.TUXText--tiktok-sans:contains("Uploaded")', {
        //                 visible: true,
        //                 timeout: 120000
        //             }),


        //             // Check for 100% progress
        //             page.waitForSelector('div.info-progress-num', {
        //                 visible: true,
        //                 timeout: 120000
        //             }).then(async (element) => {

        //                 console.log('Waiting for selector.')
        //                 await page.waitForFunction(
        //                     (el) => el.textContent === '100%',
        //                     { timeout: 120000 },
        //                     element
        //                 );
        //             })
        //         ]);

        //     } catch (error) {
        //         console.error('Upload percentage error.');
        //     }
        // } else {
        //     console.log("File input element not found.");
        //     throw new Error("File input element not found");
        // }
        // console.log("Upload Successfull.")

        if (inputFile) {
            await inputFile.uploadFile(filePath);
            console.log('Waiting for file upload to complete...');

            try {
                const progressMonitor = setInterval(async () => {
                    try {
                        // Look for progress using multiple selectors and methods
                        const progressElement = await page.$('[role="progressbar"], progress, .info-progress, .info-progress-num');
                        if (progressElement) {
                            const progress = await progressElement.evaluate(el => {
                                // Try different ways to get progress
                                const style = window.getComputedStyle(el);
                                const widthProgress = parseFloat(style.width) / parseFloat(style.maxWidth) * 100;
                                return widthProgress || el.value || 0;
                            });
                            console.log(`Upload progress: ${progress}%`);

                            if (progress >= 100) {
                                clearInterval(progressMonitor);
                                console.log('Progress reached 100%');
                            }
                        }
                    } catch (error) {
                        console.log('Progress check failed, continuing...');
                    }
                }, 1000);

                await Promise.race([
                    // Check for success using multiple indicators
                    Promise.any([
                        // Check for success icon
                        page.waitForSelector('[data-icon*="Check"], [data-icon*="Success"]', {
                            visible: true,
                            timeout: 120000
                        }),
                        // Check for "Uploaded" text in any element
                        page.waitForFunction(
                            () => Array.from(document.querySelectorAll('*'))
                                .some(el => el.textContent.includes('Uploaded')),
                            { timeout: 120000 }
                        ),
                        // Check for success state in any progress indicator
                        page.waitForSelector('[aria-label*="success"], [data-status="success"]', {
                            visible: true,
                            timeout: 120000
                        })
                    ]),

                    // Check for 100% progress using multiple methods
                    page.waitForFunction(
                        () => {
                            const progressElements = document.querySelectorAll('[role="progressbar"], progress, .info-progress');
                            return Array.from(progressElements).some(el => {
                                const style = window.getComputedStyle(el);
                                const progress = parseFloat(style.width) / parseFloat(style.maxWidth) * 100;
                                return progress >= 100 || el.value >= 100;
                            });
                        },
                        { timeout: 120000 }
                    )
                ]);

                clearInterval(progressMonitor);
            } catch (error) {
                console.error('Upload monitoring failed:', error.message);
                throw error;
            }
        } else {
            console.log("File input element not found.");
            throw new Error("File input element not found");
        }
        console.log("Upload Successful.");

        // <div class="DraftEditor-editorContainer"><div aria-autocomplete="list" aria-expanded="false" class="notranslate public-DraftEditor-content" contenteditable="true" role="combobox" spellcheck="false" style="outline: none; user-select: text; white-space: pre-wrap; overflow-wrap: break-word;"><div data-contents="true"><div class="" data-block="true" data-editor="4o39t" data-offset-key="f7kpm-0-0"><div data-offset-key="f7kpm-0-0" class="public-DraftStyleDefault-block public-DraftStyleDefault-ltr"><span data-offset-key="f7kpm-0-0"><span data-text="true">f9e5bf0fa924</span></span></div></div></div></div></div></div></div>
        // await new Promise(resolve => setTimeout(resolve, 15000));
        // await page.waitForSelector('.DraftEditor-editorContainer');
        // await page.click('.DraftEditor-editorContainer');

        // Write caption 
        await page.waitForSelector('div[role="combobox"]');
        await page.click('div[role="combobox"]');
        await new Promise(resolve => setTimeout(resolve, 500));

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

        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[role="button"]'));
            const nextButton = buttons.find(button => button.textContent.trim() === 'Post');
            if (nextButton) nextButton.click();
        });
        await new Promise(resolve => setTimeout(resolve, 1500));

        await new Promise(resolve => {
            const randomDelay = Math.floor(Math.random() * (60000 - 45000 + 1)) + 45000;
            setTimeout(resolve, randomDelay);
        });

        browser.close();

    } catch (error) {
        console.error('Error posting to TikTok:', error);
    }
}

module.exports = { PostToTiktok, getTiktokCookies };