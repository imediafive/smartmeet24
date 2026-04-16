import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MicOff, Maximize2 } from 'lucide-react';
import { cn } from '../../utils';

export const RemoteVideoPlayer = ({ stream, fit = 'cover' }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);
    return (
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted={false}
            className={cn("w-full h-full block", fit === 'cover' ? "object-cover" : "object-contain")} 
        />
    );
};

export const ScreenSharePlayer = ({ stream }) => {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
        }
    }, [stream]);

    const toggleFullscreen = () => {
        if (ref.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                ref.current.requestFullscreen();
            }
        }
    };

    return (
        <div className="relative w-full h-full group/screen overflow-hidden bg-black">
            <video 
                ref={ref} 
                autoPlay 
                playsInline 
                className="w-full h-full object-contain transition-all" 
            />
            <button
                onClick={toggleFullscreen}
                className="absolute top-4 right-4 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white transition-all scale-0 group-hover/screen:scale-100 active:scale-90 border-none cursor-pointer z-[100]"
                title="Fullscreen"
            >
                <Maximize2 size={20} />
            </button>
            <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 opacity-0 group-hover/screen:opacity-100 transition-opacity">
                <span className="text-[10px] font-black tracking-widest text-white uppercase opacity-80">Shared Screen</span>
            </div>
        </div>
    );
};

const UserTile = React.memo(({
    user,
    isYou = false,
    peerState,
    small = false,
    activeSpeaker = false,
    isHost = false,
    onForceMute,
    onForceUnmute,
    hideVideo = false
}) => {
    const nameToUse = user.userName || user.name || (isYou ? 'You' : 'User');
    const initials = (nameToUse === 'Connecting...' || !nameToUse) 
        ? '...' 
        : (nameToUse.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase() || '?');
    const isMuted = peerState?.muted ?? false;
    const handUp = peerState?.handRaised ?? false;
    const isRemoteAdminMuted = peerState?.adminMuted ?? false;
    const videoRef = useRef(null);

    const togglePiP = async (e) => {
        e.stopPropagation();
        try {
            if (videoRef.current) {
                if (document.pictureInPictureElement === videoRef.current) {
                    await document.exitPictureInPicture();
                } else {
                    await videoRef.current.requestPictureInPicture();
                }
            }
        } catch (err) {
            console.error('[PiP Error]', err);
        }
    };

    const audioRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && user.videoStream) {
            if (videoRef.current.srcObject !== user.videoStream) {
                videoRef.current.srcObject = user.videoStream;
            }
            videoRef.current.play().catch(e => console.warn('[Video Autoplay Prevented]', e));
        }
    }, [user.videoStream]);

    useEffect(() => {
        // ALWAYS play audio if the stream exists!
        if (audioRef.current && user.audioStream) {
            if (audioRef.current.srcObject !== user.audioStream) {
                audioRef.current.srcObject = user.audioStream;
            }
            audioRef.current.play().catch(e => console.warn('[Audio Autoplay Prevented]', e));
        }
    }, [user.audioStream]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                transition: { duration: 0.3, ease: 'easeOut' }
            }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            className={cn(
                "group relative overflow-hidden bg-gray-900 transition-all duration-300 border flex items-center justify-center w-full h-full",
                small ? "rounded-xl" : "rounded-2xl",
                activeSpeaker ? "border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] ring-4 ring-blue-500/20 z-10 scale-[1.01]" :
                    handUp ? "border-[#f6c90e] shadow-[0_0_15px_rgba(246,201,14,0.2)]" : "border-gray-800 shadow-sm"
            )}
        >
            {isYou ? (
                (!hideVideo && user.videoOn) && (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover block" 
                    />
                )
            ) : user.videoStream ? (
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    // Let the standalone audio element handle the sound
                    muted
                    className={cn(
                        "w-full h-full object-cover block",
                        (hideVideo || peerState?.videoOn === false) && "opacity-0"
                    )}
                />
            ) : null}

            {/* Redundant physical audio player as a backup for browser heuristics */}
            {!isYou && user.audioStream && (
                <audio 
                    ref={audioRef}
                    autoPlay
                    playsInline
                    className="opacity-0 absolute top-0 left-0 w-px h-px pointer-events-none"
                    // Double check: Never mute a remote user's audio element
                    muted={false}
                />
            )}

            {/* No-video avatar or Presentation Placeholder */}
            {(hideVideo || (isYou ? (!user.videoOn || !user.videoStream) : (!user.videoStream || peerState?.videoOn === false))) && (
                <div className="absolute inset-0 z-[1] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
                    <div className={cn(
                        "rounded-full overflow-hidden flex items-center justify-center border-4 border-white/10 shadow-2xl transition-all duration-700 bg-gray-800",
                        small ? "w-12 h-12" : "w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40",
                        activeSpeaker && "ring-4 ring-blue-500 scale-105"
                    )}>
                        {activeSpeaker && (
                            <div className="absolute inset-0 bg-blue-500/10 animate-pulse-ring z-0" />
                        )}
                        {hideVideo ? (
                            <div className="flex flex-col items-center justify-center text-premium-accent">
                                <span className="text-[8px] font-bold capitalize tracking-tight mb-1">Presenting</span>
                            </div>
                        ) : (user.userAvatar && !user.userAvatar.includes('undefined')) ? (
                            <img src={user.userAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className={cn("font-black tracking-tighter text-white leading-none drop-shadow-lg opacity-40", small ? "text-sm" : "text-4xl")}>{initials}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Hover Actions: PiP and Admin Controls */}
            <div className="absolute top-2.5 right-2.5 flex gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                {((isYou && user.videoOn) || (!isYou && user.videoStream && peerState?.videoOn !== false)) && (
                    <button
                        onClick={togglePiP}
                        className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-all active:scale-95 border-none cursor-pointer"
                        title="Picture in Picture"
                    >
                        <Maximize2 size={14} />
                    </button>
                )}

                {isHost && !isYou && (
                    <button
                        onClick={(e) => { e.stopPropagation(); isRemoteAdminMuted ? onForceUnmute?.() : onForceMute?.(); }}
                        className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all active:scale-95 shadow-lg shadow-black/30 border-none cursor-pointer",
                            isRemoteAdminMuted ? "bg-white text-black" : "bg-red-600 hover:bg-red-700 text-white"
                        )}
                    >
                        {isRemoteAdminMuted ? 'Unmute' : 'Mute'}
                    </button>
                )}
            </div>

            {handUp && <div className="absolute top-2.5 left-2.5 text-xl z-10 filter drop-shadow-md">✋</div>}
            
            {activeSpeaker && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-blue-600 px-2 py-0.5 rounded-full z-20 shadow-lg animate-in fade-in zoom-in duration-300">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white">Speaking</span>
                </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none z-0" />

            {/* Name badge */}
            <div className={cn(
                "absolute z-10 flex items-center gap-1.5 bg-white/80 backdrop-blur-md border border-gray-100 rounded-lg text-gray-900 font-bold transition-all shadow-sm",
                small ? "bottom-2 left-2 px-2 py-1 text-[10px]" : "bottom-3 left-3 px-3 py-1.5 text-xs"
            )}>
                {user.userAvatar && !user.userAvatar.includes('undefined') && <img src={user.userAvatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover border border-white/50" />}
                <span className="truncate max-w-[100px]">{user.userName || (isYou ? 'You' : initials !== '?' ? initials : '···')}</span>
                {(isMuted || isRemoteAdminMuted) && <MicOff size={11} className={isRemoteAdminMuted ? "text-red-500" : "text-gray-400"} />}
                {isRemoteAdminMuted && <span className="text-[9px] text-red-400 font-bold tracking-tight">LOCKED</span>}
            </div>
        </motion.div>
    );
});

export default UserTile;
