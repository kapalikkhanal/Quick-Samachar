const { renderMedia, renderStill, selectComposition } = require('@remotion/renderer');
const { bundle } = require('@remotion/bundler');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { exec } = require("child_process");

const generateVideo = async (imagePath, audioPath, outputPath) => {
    return new Promise((resolve, reject) => {
        // Ensure paths are absolute for FFmpeg
        const absoluteImagePath = path.resolve(imagePath);
        const absoluteAudioPath = path.resolve(audioPath);
        const absoluteOutputPath = path.resolve(outputPath);

        // FFmpeg command
        const command = `ffmpeg -y -loop 1 -i "${absoluteImagePath}" -i "${absoluteAudioPath}" -c:v libx264 -preset ultrafast -tune stillimage -c:a aac -b:a 192k -shortest -vf "scale=1080:1920" "${absoluteOutputPath}"`;

        // Execute FFmpeg command
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error("Error generating video:", error.message);
                reject(error);
                return;
            }
            if (stderr) {
                console.error("FFmpeg stderr:", stderr);
            }
            console.log(`Video successfully generated at: ${absoluteOutputPath}`);
            fs.unlink(absoluteImagePath);
            resolve(absoluteOutputPath);
        });
    });
}

async function renderVideo(newsData) {
    try {
        const bundleLocation = await bundle({
            entryPoint: path.resolve('./modules/remotion/index.tsx'),
            webpackOverride: (config) => ({
                ...config,
                resolve: {
                    ...config.resolve,
                    fallback: {
                        ...config.resolve?.fallback,
                        fs: false,
                        path: false,
                        os: false,
                    },
                },
            }),
        });
        // console.log('Bundle Location:', bundleLocation);

        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: 'BackgroundVideo',
            inputProps: { newsData },
        });
        // console.log('Composition:', composition);

        const randomId = crypto.randomBytes(6).toString('hex'); // 6 bytes = 12 characters in hex
        const outputLocation = path.resolve('./output', `${randomId}.png`);
        // console.log('Output Location:', outputLocation);

        await renderStill({
            composition,
            serveUrl: bundleLocation,
            output: outputLocation,
            inputProps: { newsData },
        });

        // Verify file exists

        if (fs.existsSync(outputLocation)) {
            console.log(`Image confirmed at: ${outputLocation}`);
        } else {
            console.error(`Image NOT found at: ${outputLocation}`);
        }

        //Add background audio
        const randomId_video = crypto.randomBytes(6).toString('hex');
        const audio_input = path.resolve("./public/audio/audio.mp3");
        const video_output = path.resolve(`./output/${randomId_video}.mp4`);


        return generateVideo(outputLocation, audio_input, video_output)

    } catch (error) {
        console.error('Error during rendering:', error);
        if (error.stackFrame) {
            console.error('Stack frame:', error.stackFrame);
        }
        throw error;
    }
}

module.exports = { renderVideo };
