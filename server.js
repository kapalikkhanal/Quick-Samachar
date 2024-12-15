const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const https = require('https');

const { renderVideo } = require('./modules/remotion/render');
const { PostToTiktok, getTiktokCookies } = require('./modules/tiktok/tiktok');
const { PostToInstagram, getInstagramCookies } = require('./modules/instagram/instagram');

const app = express();
const PORT = process.env.PORT || 3003;

// Supabase client setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// TikTok Video Posting Queue
class TikTokPostQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    async enqueue(videoPath, articleId) {
        this.queue.push({ videoPath, articleId });
        await this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (this.queue.length > 0) {
                const { videoPath, articleId } = this.queue.shift();

                try {
                    await PostToTiktok(videoPath);
                    // await PostToInstagram(videoPath);
                    await fs.unlink(videoPath);

                    await supabase
                        .from('news_articles')
                        .update({
                            video_generation: true,
                            processed_at: new Date().toISOString()
                        })
                        .eq('id', articleId);

                    console.log(`Posted and deleted video for article ID: ${articleId}`);
                } catch (postError) {
                    console.error(`Video posting error for ${videoPath}:`, postError);
                    this.queue.unshift({ videoPath, articleId });
                    break;
                }
            }
        } catch (error) {
            console.error('Queue processing error:', error);
        } finally {
            this.isProcessing = false;
        }
    }
}

const tikTokPostQueue = new TikTokPostQueue();

// Fetch HTML content
const fetchHTML = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
            let data = '';

            // Collect data chunks
            res.on('data', (chunk) => {
                data += chunk;
            });

            // On response end
            res.on('end', () => {
                try {
                    const $ = cheerio.load(data);
                    resolve($);
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
};

// Paraphrase content
const paraphraseContent = async (content) => {
    try {
        const response = await axios.post('https://gemini-uts6.onrender.com/api/askgemini', {
            text: content
        });
        return response.data.response || content;
    } catch (error) {
        console.error('Paraphrasing error:', error.message);
        return content;
    }
};

// Scrape and process news articles
const scrapeAndProcessNews = async () => {
    const baseURL = 'https://www.onlinekhabar.com';

    try {
        const $ = await fetchHTML(baseURL);
        if (!$) return [];

        const processedArticles = [];
        const newsSections = $('.ok-bises');

        for (let i = 0; i < newsSections.length; i++) {
            const newsItem = $(newsSections[i]);
            const title = newsItem.find('h2 > a').text().trim();
            const fullLink = newsItem.find('h2 > a').attr('href');

            if (!fullLink) continue;

            const newsPageURL = fullLink.startsWith('http')
                ? fullLink
                : `${baseURL}${fullLink}`;

            // Check existing article
            const { data: existingArticle } = await supabase
                .from('news_articles')
                .select('*')
                .eq('link', newsPageURL)
                .single();

            if (existingArticle) {
                processedArticles.push(existingArticle);
                continue;
            }

            // Fetch article details
            const newsPage = await fetchHTML(newsPageURL);
            if (!newsPage) continue;

            const imageURL = newsPage('.ok-post-detail-featured-img img').attr('src');
            const contentArray = [];
            newsPage('.ok18-single-post-content-wrap p').each((_, element) => {
                contentArray.push(newsPage(element).text().trim());
            });

            const originalContent = contentArray.join('\n');
            const paraphrasedContent = await paraphraseContent(
                `${originalContent}\nSummarize in Nepali, under 200 characters.`
            );

            // Insert new article
            const { data: newArticle, error } = await supabase
                .from('news_articles')
                .insert({
                    title,
                    link: newsPageURL,
                    image_url: imageURL,
                    content: paraphrasedContent,
                    video_generation: false
                })
                .select()
                .single();

            if (newArticle) processedArticles.push(newArticle);
        }

        return processedArticles;
    } catch (error) {
        console.error('News scraping error:', error);
        return [];
    }
};

// Clean up old articles
const cleanupOldArticles = async (currentArticles) => {
    try {
        const { data: allArticles } = await supabase
            .from('news_articles')
            .select('*');

        const articlesToDelete = allArticles.filter(
            oldArticle => !currentArticles.some(
                newArticle => newArticle.link === oldArticle.link
            )
        );

        if (articlesToDelete.length > 0) {
            const deleteIds = articlesToDelete.map(article => article.id);
            await supabase
                .from('news_articles')
                .delete()
                .in('id', deleteIds);

            console.log(`Deleted ${deleteIds.length} old articles`);
        }
    } catch (error) {
        console.error('Article cleanup error:', error);
    }
};

const processNewsVideos = async () => {
    try {
        const { data: articles } = await supabase
            .from('news_articles')
            .select('*')
            .eq('video_generation', false);

        for (const article of articles) {
            try {
                const videoPath = await renderVideo({
                    title: article.title,
                    content: article.content,
                    imageUrl: article.image_url
                });

                if (videoPath) {
                    // Enqueue video for posting
                    await tikTokPostQueue.enqueue(videoPath, article.id);
                }
            } catch (renderError) {
                console.error(`Video generation error for ${article.title}:`, renderError);
            }
        }
    } catch (error) {
        console.error('News video processing error:', error);
    }
};

// Main news processing job
const newsProcessingJob = async () => {
    console.log('Starting news processing job');
    const currentArticles = await scrapeAndProcessNews();
    await cleanupOldArticles(currentArticles);
    await processNewsVideos();
};

// Schedule periodic job
cron.schedule('*/10 * * * *', newsProcessingJob);

// getTiktokCookies('https://www.tiktok.com/login', 'tiktok')
// getInstagramCookies('https://www.instagram.com/accounts/login/', 'instagram')

// Manual trigger endpoint
app.get('/trigger-scrape', async (req, res) => {
    try {
        res.json({ message: 'Trigerred Successfully.' });
        await newsProcessingJob();
    } catch (error) {
        res.status(500).json({
            message: 'News processing failed',
            error: error.message
        });
    }
});

app.get('/health-check', async (req, res) => {
    try {
        res.json({ message: 'Server is working fine.' });
    } catch (error) {
        res.status(500).json({
            message: 'Server failed'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Initial news processing job starting...');
    newsProcessingJob(); // Initial run on startup
});