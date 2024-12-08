const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { renderVideo } = require('./modules/remotion/render');
const { PostToTiktok, getCookies } = require('./modules/tiktok/tiktok');

const app = express();
const PORT = 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());

const fetchHTML = async (url) => {
    try {
        const { data } = await axios.get(url);
        return cheerio.load(data);
    } catch (error) {
        console.error(`Error fetching the URL: ${url}`, error);
        throw error;
    }
};

const paraphraseContent = async (content) => {
    try {
        const response = await axios.post('https://gemini-uts6.onrender.com/api/askgemini', {
            text: content
        });

        return response.data.response || content;
    } catch (error) {
        console.error('Error paraphrasing content:', error);
        return content;
    }
};

// Function to scrape and save news
const scrapeAndSaveNews = async () => {
    const baseURL = 'https://www.onlinekhabar.com';

    try {
        const $ = await fetchHTML(baseURL);
        const newsSections = $('.ok-bises');

        await Promise.all(newsSections.map(async (_, section) => {
            const newsItem = $(section);

            const title = newsItem.find('h2 > a').text().trim();
            const fullLink = newsItem.find('h2 > a').attr('href');

            if (!fullLink) return;

            const newsPageURL = fullLink.startsWith('http') ? fullLink : `${baseURL}${fullLink}`;

            try {
                const newsPage = await fetchHTML(newsPageURL);
                const imageURL = newsPage('.ok-post-detail-featured-img img').attr('src');
                const contentArray = [];
                newsPage('.ok18-single-post-content-wrap p').each((_, element) => {
                    contentArray.push(newsPage(element).text().trim());
                });

                const originalContent = contentArray.join('\n');
                // console.log("here", originalContent)

                // Check if article already exists
                const { data: existingArticle, error: checkError } = await supabase
                    .from('news_articles')
                    .select('*')
                    .eq('link', newsPageURL)
                    .single();

                if (checkError || !existingArticle) {
                    console.log("here")
                    // If article is new, insert it
                    // First, get current articles count
                    const { count } = await supabase
                        .from('news_articles')
                        .select('*', { count: 'exact' });

                    // If we have 2 or more articles, delete the oldest one
                    if (count >= 2) {
                        const { data: oldestArticle } = await supabase
                            .from('news_articles')
                            .select('*')
                            .order('timestamp', { ascending: true })
                            .limit(1)
                            .single();

                        if (oldestArticle) {
                            await supabase
                                .from('news_articles')
                                .delete()
                                .eq('id', oldestArticle.id);
                        }
                    }

                    const paraphrasedContent = await paraphraseContent(originalContent + "\n" + "Based on this news content, Summarize it in Nepali language, less than 200 characters, single paragraph, no extra explanation.");

                    // Insert new article
                    const { error } = await supabase
                        .from('news_articles')
                        .insert({
                            title,
                            link: newsPageURL,
                            image_url: imageURL,
                            content: paraphrasedContent,
                            audio_url: null
                        });

                    if (error) {
                        console.error('Error inserting article:', error);
                    }
                }
            } catch (error) {
                console.error(`Error processing article: ${newsPageURL}`, error);
            }
        }).filter(Boolean));

        console.log('News scraping and saving completed');
    } catch (error) {
        console.error('Error in scrapeAndSaveNews:', error);
    }
};

const renderNewsVideos = async () => {
    try {
        console.log("Rendering video started.")
        // Fetch all news articles that haven't been processed for video
        const { data: articles, error } = await supabase
            .from('news_articles')
            .select('*')
            .is('video_generation', null || false)
            .order('timestamp', { ascending: true });

        if (error) {
            console.error('Error fetching articles:', error);
            return;
        }

        if (!articles || articles.length === 0) {
            console.log('No articles to process for video rendering');
            return;
        }

        // Process articles sequentially
        for (const article of articles) {
            try {

                const newsData = {
                    title: article.title,
                    content: article.content,
                    imageUrl: article.image_url
                };

                const videoPath = await renderVideo(newsData);
                console.log('Generated Video Path:', videoPath);

                await PostToTiktok(videoPath);

                // Update the article with the video URL
                if (videoPath) {
                    const { error: updateError } = await supabase
                        .from('news_articles')
                        .update({
                            video_generation: true,
                            processed_at: new Date().toISOString()
                        })
                        .eq('id', article.id);

                    if (updateError) {
                        console.error(`Error updating article ${article.id} with video URL:`, updateError);
                    } else {
                        console.log(`Processed video for article: ${article.title}`);
                    }
                }
            } catch (renderError) {
                console.error(`Error rendering video for article ${article.id}:`, renderError);
            }
        }
    } catch (error) {
        console.error('Error in renderNewsVideos:', error);
    }
};

// Modify the existing cron job
cron.schedule('*/10 * * * *', async () => {
    console.log('Running news scraping and video rendering job');
    await scrapeAndSaveNews();
    await renderNewsVideos();
});

app.get('/trigger-scrape', async (req, res) => {
    try {
        await scrapeAndSaveNews();
        await renderNewsVideos();
        res.json({ message: 'Scraping triggered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error triggering scrape', error: error.message });
    }
});

// getCookies('https://www.tiktok.com/login', 'tiktok')

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});