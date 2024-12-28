const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const { connect } = require('puppeteer-real-browser');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('iframe.contentWindow');
stealthPlugin.enabledEvasions.delete('navigator.plugins');
puppeteer.use(stealthPlugin);

// Add debug logging utility
const debug = {
    log: (message, type = 'info') => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        console.log(logMessage);

        // Also write to a log file
        // fs.appendFileSync('tiktok-upload.log', logMessage + '\n');
    },
    error: (message, error) => {
        const errorDetail = error ? `\nError Details: ${error.message}\nStack: ${error.stack}` : '';
        debug.log(`${message}${errorDetail}`, 'error');
    }
};

async function validateSession(page) {
    try {
        // Check if we're still logged in
        await page.goto('https://www.tiktok.com/friends', { waitUntil: 'networkidle2' });

        const isLoggedIn = await page.evaluate(() => {
            // Look for common logged-in indicators
            return document.querySelector('[data-e2e="search-box"]') !== null;
        });

        if (!isLoggedIn) {
            debug.log('Session appears to be invalid or expired', 'warning');
            return false;
        }

        debug.log('Session validation successful');
        return true;
    } catch (error) {
        debug.error('Error validating session', error);
        return false;
    }
}

async function loadSessionData(page, sessionFilePath) {
    try {
        if (!fs.existsSync(sessionFilePath)) {
            debug.error(`Session file not found: ${sessionFilePath}`);
            return false;
        }

        const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));

        if (!sessionData.cookies || !sessionData.cookies.length) {
            debug.error('No cookies found in session data');
            return false;
        }

        debug.log(`Loading ${sessionData.cookies.length} cookies`);
        await page.setCookie(...sessionData.cookies);

        debug.log('Loading localStorage data');
        await page.evaluate((localStorageData) => {
            Object.keys(localStorageData).forEach(key => {
                localStorage.setItem(key, localStorageData[key]);
            });
        }, sessionData.localStorageData);

        debug.log('Session data loaded successfully');
        return true;
    } catch (error) {
        debug.error('Error loading session data', error);
        return false;
    }
}

async function saveSessionData(page, sessionFilePath) {
    try {
        const cookies = await page.cookies();
        debug.log(`Saving ${cookies.length} cookies`);

        const localStorageData = await page.evaluate(() => {
            let data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            return data;
        });

        fs.writeFileSync(sessionFilePath, JSON.stringify({ cookies, localStorageData }));
        debug.log('Session data saved successfully');
        return true;
    } catch (error) {
        debug.error('Error saving session data', error);
        return false;
    }
}

async function getTiktokCookies(url, application_name) {
    let browser, page;
    try {
        debug.log('Launching browser for cookie capture');
        const connection = await connect({
            headless: false,
            turnstile: true,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            fingerprint: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        });
        browser = connection.browser;
        page = connection.page;

        debug.log('Setting up page configuration');
        await page.setBypassCSP(true);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

        debug.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        debug.log('Waiting for manual login (120 seconds)');
        await new Promise(resolve => setTimeout(resolve, 120000));

        const sessionSaved = await saveSessionData(page, `${application_name}_cookies.json`);
        if (!sessionSaved) {
            throw new Error('Failed to save session data');
        }

    } catch (error) {
        debug.error('Error in getTiktokCookies', error);
    } finally {
        if (browser) {
            debug.log('Closing browser');
            await browser.close();
        }
    }
}

async function checkUploadStatus(page) {
    try {
        // Check for error messages
        const errorElement = await page.$('[class*="error"], [class*="Error"]');
        if (errorElement) {
            const errorText = await errorElement.evaluate(el => el.textContent);
            debug.log(`Upload error detected: ${errorText}`, 'error');
            return { success: false, error: errorText };
        }

        // Check for success indicators
        const successIndicators = [
            '[data-icon*="success"]',
            '[class*="success"]',
            '[aria-label*="uploaded successfully"]'
        ];

        for (const selector of successIndicators) {
            const element = await page.$(selector);
            if (element) {
                debug.log('Upload success indicator found');
                return { success: true };
            }
        }

        return { success: false, error: 'No success indicator found' };
    } catch (error) {
        debug.error('Error checking upload status', error);
        return { success: false, error: error.message };
    }
}

async function PostToTiktok(filePath, hashtags = '') {
    let browser, page;
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Video file not found: ${filePath}`);
        }

        debug.log('Launching browser');
        const connection = await connect({
            headless: false,
            turnstile: true,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            fingerprint: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        });
        browser = connection.browser;
        page = connection.page;

        debug.log('Navigating to TikTok login page');
        await page.goto('https://tiktok.com/login', { waitUntil: 'networkidle2' });

        debug.log('Loading cookies');
        const cookiesPath = path.join(__dirname, '..', '..', 'Cookies', 'tiktok_cookies.json');
        const cookiesLoaded = await loadSessionData(page, cookiesPath);
        if (!cookiesLoaded) {
            throw new Error('Failed to load cookies');
        }

        debug.log('Validating session');
        const isSessionValid = await validateSession(page);
        if (!isSessionValid) {
            throw new Error('Session validation failed - cookies may be expired');
        }

        // <form data-e2e="search-box" class="search-input css-1x92qzh-FormElement e14ntknm0" action="/search"><input placeholder="Search" name="q" type="search" autocomplete="off" role="combobox" aria-controls="" aria-label="Search" aria-expanded="false" aria-autocomplete="list" data-e2e="search-user-input" class="css-1geqepl-InputElement e14ntknm3" value=""><span class="css-gin10i-SpanSpliter e14ntknm6"></span><button data-e2e="search-box-button" type="submit" aria-label="Search" class="css-16rv2p6-ButtonSearch e14ntknm7"><div class="css-17iic05-DivSearchIconContainer e14ntknm8"><svg width="24" data-e2e="" height="24" viewBox="0 0 48 48" fill="rgba(255, 255, 255, .34)" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M22 10C15.3726 10 10 15.3726 10 22C10 28.6274 15.3726 34 22 34C28.6274 34 34 28.6274 34 22C34 15.3726 28.6274 10 22 10ZM6 22C6 13.1634 13.1634 6 22 6C30.8366 6 38 13.1634 38 22C38 25.6974 36.7458 29.1019 34.6397 31.8113L43.3809 40.5565C43.7712 40.947 43.7712 41.5801 43.3807 41.9705L41.9665 43.3847C41.5759 43.7753 40.9426 43.7752 40.5521 43.3846L31.8113 34.6397C29.1019 36.7458 25.6974 38 22 38C13.1634 38 6 30.8366 6 22Z"></path></svg></div></button><div class="css-1bmf8gr-DivInputBorder e14ntknm1"></div></form>

        debug.log('Navigating to upload page');
        await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=upload', {
            waitUntil: 'networkidle2'
        });

        debug.log('Waiting for file input');
        const inputFile = await page.waitForSelector('input[type="file"]', {
            visible: false,
            timeout: 30000
        });

        if (!inputFile) {
            throw new Error('File input element not found');
        }

        debug.log('Uploading file');
        await inputFile.uploadFile(filePath);

        // Monitor upload progress
        const progressMonitor = setInterval(async () => {
            try {
                const progressElement = await page.$('div.info-progress-num, [role="progressbar"], progress, .info-progress');
                if (progressElement) {
                    // const progress = await progressElement.evaluate(el => {
                    //     const style = window.getComputedStyle(el);
                    //     const widthProgress = parseFloat(style.width) / parseFloat(style.maxWidth) * 100;
                    //     return widthProgress || el.value || 0;
                    // });
                    const progress = await progressElement.evaluate(el => el.textContent);
                    debug.log(`Upload progress: ${progress}%`);
                }
            } catch (error) {
                // Ignore progress check errors
            }
        }, 1000);

        // Wait for upload completion
        await Promise.race([
            Promise.any([
                page.waitForSelector('[data-icon*="Check"], [data-icon*="Success"]', {
                    visible: true,
                    timeout: 120000
                }),
                page.waitForFunction(
                    () => Array.from(document.querySelectorAll('*'))
                        .some(el => el.textContent.includes('Uploaded')),
                    { timeout: 120000 }
                )
            ]),
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

        // Verify upload status
        const uploadStatus = await checkUploadStatus(page);
        if (!uploadStatus.success) {
            throw new Error(`Upload verification failed: ${uploadStatus.error}`);
        }

        debug.log('Upload confirmed successful, proceeding with caption');

        // Add caption
        debug.log('Adding caption');
        await page.waitForSelector('div[role="combobox"]');
        await page.click('div[role="combobox"]');
        await new Promise(resolve => setTimeout(resolve, 500));

        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');

        const caption = `Follow for more news content like these. \n \n`;
        const hashtagList = hashtags.split(' ');

        await page.evaluate((text) => navigator.clipboard.writeText(text), caption);
        await page.keyboard.down('Control');
        await page.keyboard.press('V');
        await page.keyboard.up('Control');

        for (const hashtag of hashtagList) {
            for (const char of hashtag) {
                await page.keyboard.type(char, { delay: 100 + Math.floor(Math.random() * 100) });
            }
            await new Promise(resolve => setTimeout(resolve, 1600));
            await page.keyboard.press('Tab');
        }

        debug.log('Finalizing post');
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');

        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('ArrowDown');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Click Post button
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[role="button"]'));
            const nextButton = buttons.find(button => button.textContent.trim() === 'Post');
            if (nextButton) nextButton.click();
        });

        debug.log('Post button clicked, waiting for completion');
        await new Promise(resolve => {
            const randomDelay = Math.floor(Math.random() * (60000 - 45000 + 1)) + 45000;
            setTimeout(resolve, randomDelay);
        });

        debug.log('Post process completed successfully');

    } catch (error) {
        debug.error('Error in PostToTiktok', error);
        throw error;
    } finally {
        if (browser) {
            debug.log('Closing browser');
            await browser.close();
        }
    }
}

module.exports = { PostToTiktok, getTiktokCookies };