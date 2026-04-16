import React, { memo } from 'react';
import UserTile from './UserTile';
import { cn } from '../../utils';

const VideoGrid = memo(({ myData, remoteUsers, activeSpeaker, peerStates, isHost, forceMutePeer, forceUnmutePeer, micOn, handRaised, adminMuted, totalPeople }) => {
    return (
        <div className="flex-1 h-full flex flex-col min-h-0">
            {/* Mobile: Full Speaker Mode */}
            <div className="sm:hidden flex-1 h-full relative">
                {(() => {
                    const speaker = remoteUsers.find(u => activeSpeaker === u.id) || myData;
                    const isMe = speaker.id === myData.id;
                    return (
                        <div className="absolute inset-0 m-2 rounded-2xl overflow-hidden bg-white border border-black/10 shadow-xl">
                            <UserTile
                                isYou={isMe} user={speaker}
                                peerState={isMe ? { muted: !micOn, handRaised, adminMuted } : peerStates[speaker.id]}
                                activeSpeaker={true}
                                isHost={isHost}
                                onForceMute={!isMe ? () => forceMutePeer(speaker.id) : undefined}
                                onForceUnmute={!isMe ? () => forceUnmutePeer(speaker.id) : undefined}
                            />

                            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center p-4">
                                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-6 py-2 rounded-full border border-black/5 shadow-xl">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-black uppercase tracking-widest">
                                        {isMe ? 'Listening to You' : `Viewing ${speaker.userName}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Desktop: Grid View */}
            <div className="hidden sm:flex flex-col flex-1 min-h-0 h-full p-4 overflow-hidden">
                <div className={cn(
                    "flex-1 min-h-0 grid gap-4 place-items-center",
                    totalPeople === 1 ? "grid-cols-1" : "grid-cols-2"
                )}>
                    {/* Me */}
                    <div className={cn(
                        "relative rounded-3xl overflow-hidden bg-white border border-black/10 shadow-2xl w-full h-full",
                        totalPeople === 1 && "max-w-4xl max-h-[80%]"
                    )}>
                        <UserTile
                            isYou user={myData}
                            peerState={{ muted: !micOn, handRaised, adminMuted }}
                            activeSpeaker={activeSpeaker === 'me'}
                        />
                        {activeSpeaker === 'me' && (
                            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center py-4">
                                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/10 shadow-md">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-black uppercase tracking-widest">Speaking</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Active or First Remote Peer */}
                    {remoteUsers.length > 0 && (() => {
                        const primary = remoteUsers.find(u => activeSpeaker === u.id) || remoteUsers[0];
                        return (
                            <div key={primary.id} className="relative w-full h-full rounded-3xl overflow-hidden bg-white border border-black/10 shadow-2xl transition-all">
                                <UserTile
                                    user={primary}
                                    peerState={peerStates[primary.id]}
                                    activeSpeaker={activeSpeaker === primary.id}
                                    isHost={isHost}
                                    onForceMute={() => forceMutePeer(primary.id)}
                                    onForceUnmute={() => forceUnmutePeer(primary.id)}
                                />

                                {activeSpeaker === primary.id && (
                                    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center py-4">
                                        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/10 shadow-md">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-black uppercase tracking-widest">{primary.userName}</span>
                                        </div>
                                    </div>
                                )}

                            </div>
                        );
                    })()}
                </div>

                {/* Desktop Overflow Strip */}
                {remoteUsers.length > 1 && (
                    <div className="shrink-0 flex gap-4 overflow-x-auto scrollbar-none py-2">
                        {remoteUsers.slice(1).map(u => (
                            <div key={u.id} className="w-56 aspect-video shrink-0 rounded-2xl overflow-hidden border border-black/10 bg-white shadow-xl">
                                <UserTile
                                    user={u}
                                    peerState={peerStates[u.id]}
                                    activeSpeaker={activeSpeaker === u.id}
                                    isHost={isHost}
                                    onForceMute={() => forceMutePeer(u.id)}
                                    onForceUnmute={() => forceUnmutePeer(u.id)}
                                    small
                                />

                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default VideoGrid;
