// MediaProcessor.js - Advanced real-time video processing engine
export const applyFilterToStream = async (stream, filterStyle) => {
    if (!stream || !filterStyle || filterStyle === 'none') return stream;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return stream;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([videoTrack]);
    
    await new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play().then(resolve).catch(resolve);
        };
        setTimeout(resolve, 2000); 
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    
    // Dynamically set canvas size to match video source to prevent forced scaling/distortion
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const processFrame = () => {
        if (video.paused || video.ended) return;
        
        if (filterStyle === 'ghost') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.filter = 'grayscale(1) invert(1) contrast(1.5) brightness(1.2)';
            ctx.globalAlpha = 0.4;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
        } else if (filterStyle === 'background-blur') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.filter = 'blur(20px) brightness(0.8) contrast(1.1) saturate(1.2)';
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.filter = 'none';
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 80,
                canvas.width / 2, canvas.height / 2, 500
            );
            gradient.addColorStop(0, 'white');
            gradient.addColorStop(0.6, 'rgba(255,255,255,0.8)');
            gradient.addColorStop(1, 'transparent');
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'destination-over';
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (filterStyle === 'cyberpunk') {
                ctx.filter = 'contrast(1.4) brightness(1.1) saturate(1.8) hue-rotate(-20deg)';
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillStyle = 'rgba(255, 0, 255, 0.1)'; 
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else if (filterStyle === 'classic') {
                ctx.filter = 'sepia(0.5) contrast(1.1) brightness(1.1) saturate(1.2)';
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // Add a warm glow
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.filter = 'blur(4px) brightness(1.2)';
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                ctx.restore();
            } else if (filterStyle === 'dramatic') {
                ctx.filter = 'contrast(1.6) brightness(0.8) saturate(0.8) hue-rotate(-10deg)';
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // Add a vignette effect
                const vignette = ctx.createRadialGradient(
                    canvas.width / 2, canvas.height / 2, canvas.height / 4,
                    canvas.width / 2, canvas.height / 2, canvas.width / 1.5
                );
                vignette.addColorStop(0, 'rgba(0,0,0,0)');
                vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
                ctx.fillStyle = vignette;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else if (filterStyle === 'beauty') {
                ctx.filter = 'brightness(1.1) saturate(1.1) contrast(1.05)';
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // Smooth skin glow
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.filter = 'blur(5px) brightness(1.2) contrast(0.9)';
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                ctx.restore();
            } else {
                ctx.filter = filterStyle;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
        }
        
        requestAnimationFrame(processFrame);
    };

    processFrame();

    const filteredStream = canvas.captureStream(24);
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) filteredStream.addTrack(audioTrack);
    
    return filteredStream;
};

export const FILTERS = [
    { id: 'none', label: 'None', style: 'none' },
    { id: 'beauty', label: 'Beauty', style: 'beauty' },
    { id: 'vibrant', label: 'Vibrant', style: 'saturate(2.2) contrast(1.3) brightness(1.1)' },
    { id: 'dramatic', label: 'Dramatic', style: 'dramatic' },
    { id: 'bw', label: 'Noir B&W', style: 'grayscale(1) contrast(1.5) brightness(0.9)' },
    { id: 'classic', label: 'Classic', style: 'classic' },
    { id: 'ghost', label: 'Ghost', style: 'ghost' },
];
