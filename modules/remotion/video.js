import '../../public/global.css'
import { Video, Img, useVideoConfig, staticFile } from 'remotion';
import { Helmet } from 'react-helmet';

export const VideoBackground = ({ newsData }) => {
    const { width, height } = useVideoConfig();

    if (!newsData) {
        return null;
    }

    // console.error(newsData)
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>

            <Helmet>
                <link
                    href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap"
                    rel="stylesheet"
                />
            </Helmet>

            <Img
                src={staticFile('/images/background.png')}
                style={{
                    width: width,
                    height: height,
                    objectFit: 'cover',
                }}
                onError={(event) => {
                    // Handle image loading error here
                }}
            />

            {/* Text Overlay */}
            <div
                style={{
                    position: 'absolute',
                    top: '1000px',
                    left: '80px'
                }}
            >
                {Array.isArray(newsData) && newsData.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'start', flexDirection: 'column', marginRight: '180px' }}>
                        <p style={{
                            color: 'black',
                            fontSize: '48px',
                            textAlign: 'left',
                            marginBottom: -10,
                            fontFamily: "'Montserrat','Noto Sans Devanagari', sans-serif"
                        }}>
                            {newsData[0].title}
                        </p>
                        <p style={{
                            color: 'black',
                            fontSize: '40px',
                            textAlign: 'left',
                            fontFamily: "'Montserrat','Noto Sans Devanagari', sans-serif"
                        }}>
                            {newsData[0].content}
                        </p>
                    </div>
                )}
            </div>

            {/* Image Overlay */}
            <div>
                {Array.isArray(newsData) && newsData.length > 0 && (
                    <Img
                        src={newsData[0].imageUrl}
                        style={{
                            position: 'absolute',
                            top: 0,
                            width: '1080px',
                            height: '820px',
                            objectFit: 'cover',
                        }}
                        onError={(event) => {
                            // Handle image loading error here
                        }}
                    />
                )}
            </div>
        </div>
    );
};
