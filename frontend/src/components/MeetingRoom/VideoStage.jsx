import React, { memo, useState, useRef, useEffect } from 'react';
import UserTile, { RemoteVideoPlayer, ScreenSharePlayer } from './UserTile';
import { ScreenShare, Maximize, Minimize } from 'lucide-react';

const VideoStage = memo(({ isSharing, screenTrackState, sharingRemoteUser, sharingPeerId, myData, remoteUsers, activeSpeaker, peerStates, isHost, forceMutePeer, forceUnmutePeer, micOn, handRaised, adminMuted }) => {
    const stageRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            stageRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    return (
        <div className="flex-1 h-full flex flex-col sm:flex-row min-h-0 p-2 sm:p-4 gap-4">
            {/* Participants strip - Desktop only */}
            {!isFullscreen && (
                <div className="hidden sm:flex w-64 shrink-0 flex-col gap-4 overflow-y-auto pr-2 scrollbar-none border-r border-white/5">
                    <div className="aspect-video w-full shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/10 ring-1 ring-white/5">
                        <UserTile
                            isYou user={myData}
                            peerState={{ muted: !micOn, handRaised, adminMuted }}
                            activeSpeaker={activeSpeaker === 'me'}
                            small
                            hideVideo={isSharing}
                        />
                    </div>
                    {remoteUsers.map(u => (
                        <div key={u.id} className="aspect-video w-full shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/10 ring-1 ring-white/5">
                            <UserTile
                                user={u}
                                peerState={peerStates[u.id]}
                                activeSpeaker={activeSpeaker === u.id}
                                isHost={isHost}
                                onForceMute={() => forceMutePeer(u.id)}
                                onForceUnmute={() => forceUnmutePeer(u.id)}
                                small
                                hideVideo={String(u.id) === String(sharingPeerId)}
                            />
                        </div>
                    ))}

                </div>
            )}

            {/* Main Stage */}
            <div 
                ref={stageRef}
                className="flex-1 h-full min-h-0 relative rounded-2xl sm:rounded-3xl overflow-hidden bg-black shadow-2xl border border-black/10 group"
            >
                {isSharing ? (
                    <ScreenSharePlayer track={screenTrackState} />
                ) : (
                    <RemoteVideoPlayer videoTrack={sharingRemoteUser?.videoTrack} fit="contain" />
                )}
                
                {/* Fullscreen Button */}
                <button
                    onClick={toggleFullscreen}
                    className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100"
                    title="Toggle Fullscreen"
                >
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>

                <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-gray-900/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 backdrop-blur-md text-white shadow-xl border border-white/10">
                            <ScreenShare size={14} className="animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">
                                {isSharing ? 'Currently Presenting' : `Viewing ${sharingRemoteUser?.userName || 'Participant'}`}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default VideoStage;
