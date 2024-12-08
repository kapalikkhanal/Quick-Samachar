import { registerRoot, Composition, getInputProps } from 'remotion';
import { VideoBackground } from './video';
import React from 'react';

const { newsData } = getInputProps<{ newsData: any }>();

export const RemotionVideo: React.FC = () => {

    console.error('Started');

    return (
        <Composition
            id="BackgroundVideo"
            component={() => (
                <VideoBackground
                    newsData={[newsData]}
                />
            )}
            width={1080}
            height={1920}
            fps={30}
            durationInFrames={1}
        />
    );
};

registerRoot(RemotionVideo);