import React, { useState, useEffect } from 'react';
import { Video as VideoIcon, Users, LogOut, PhoneOff, Pencil, Check, X } from 'lucide-react';
import { useAuthContext } from '../../AuthContext';
import { cn } from '../../utils';
import { toast } from 'sonner';

const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

const MeetingHeader = ({
    isRecording, recSeconds,
    isScreenRecording, screenRecSeconds,
    uploading, setShowInvite, participantCount, waitingCount = 0, setShowParticipants, isHost, handleLeave, onEnd,
    title, updateTitle, roomId
}) => {
    const [localTitle, setLocalTitle] = useState(title);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (!isEditing) setLocalTitle(title);
    }, [title, isEditing]);

    const handleSync = async () => {
        const trimmed = localTitle.trim();
        if (!trimmed) return; // Don't allow empty, but don't snap back either!
        
        if (trimmed === title) {
            setIsEditing(false);
            return;
        }

        await updateTitle(trimmed);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setLocalTitle(title);
        setIsEditing(false);
    };

    return (
        <header className="h-16 px-6 flex items-center justify-between z-50 transition-all shrink-0 bg-white/90 border-b border-gray-200 backdrop-blur-xl">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-premium-accent flex items-center justify-center shadow-lg shadow-premium-accent/20">
                    <VideoIcon size={18} className="text-white" />
                </div>
                <div className="flex flex-col">
                    {isHost ? (
                        <div className="flex items-center gap-1 group">
                            <input
                                className={cn(
                                    "bg-transparent border-none font-extrabold text-sm tracking-tight leading-none outline-none rounded px-1 -ml-1 w-[100px] sm:w-[150px] transition-all",
                                    isEditing ? "ring-2 ring-premium-accent/20 bg-gray-50 focus:bg-white" : "hover:bg-gray-50/50"
                                )}
                                value={localTitle}
                                onFocus={() => setIsEditing(true)}
                                onChange={(e) => setLocalTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSync();
                                    if (e.key === 'Escape') handleCancel();
                                }}
                                placeholder="Meeting Title"
                                autoComplete="off"
                                spellCheck="false"
                            />
                            {isEditing ? (
                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleSync(); }}
                                        disabled={!localTitle.trim()}
                                        className={cn(
                                            "p-1 rounded-md transition-all shadow-sm",
                                            localTitle.trim() ? "bg-premium-accent text-white hover:bg-premium-accent/80" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                        )}
                                        title="Save Title"
                                    >
                                        <Check size={12} strokeWidth={3} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                        className="p-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all"
                                        title="Cancel"
                                    >
                                        <X size={12} strokeWidth={3} />
                                    </button>
                                </div>
                            ) : (
                                <Pencil size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </div>
                    ) : (
                        <span className="font-extrabold text-sm tracking-tight leading-none truncate max-w-[120px] sm:max-w-[200px]">{title}</span>
                    )}
                    <span className="text-[10px] font-bold text-gray-400 capitalize tracking-tight mt-0.5">Live Session</span>
                </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
                {isRecording && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 border border-red-600 text-white">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-bold tracking-tight truncate max-w-[60px] sm:max-w-none">AI REC {fmtTime(recSeconds)}</span>
                    </div>
                )}

                {isScreenRecording && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500 border border-blue-600 text-white">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-bold tracking-tight truncate max-w-[60px] sm:max-w-none">SCR {fmtTime(screenRecSeconds)}</span>
                    </div>
                )}

                {uploading && <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest animate-pulse mx-2">Saving...</span>}

                    <button
                        onClick={() => setShowParticipants(true)}
                        className="relative flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl text-[11px] font-bold tracking-tight transition-all active:scale-95 border bg-white border-gray-100 hover:bg-gray-50 text-gray-600"
                    >
                        <Users size={14} />
                        <span className="hidden sm:inline">Members</span>
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] sm:w-5 sm:h-5 rounded-full bg-gray-100 text-[9px] sm:text-[10px] font-black">
                            {participantCount}
                        </span>
                        {isHost && waitingCount > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-orange-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm text-[9px] font-black text-white px-1">
                                {waitingCount}
                            </span>
                        )}
                    </button>

                <div className="w-px h-6 bg-gray-100 mx-1" />

                <button
                    onClick={() => setShowInvite(true)}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 border bg-white border-gray-100 hover:bg-gray-50 text-gray-900"
                >
                    <span className="sm:hidden">+</span>
                    <span className="hidden sm:inline">Invite</span>
                </button>

                {isHost ? (
                    <button
                        onClick={onEnd}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold tracking-tight transition-all active:scale-95 border bg-red-50 border-red-100 text-red-600 hover:bg-red-500 hover:text-white group shadow-sm hover:shadow-red-200"
                    >
                        <PhoneOff size={14} className="group-hover:-rotate-90 transition-transform" />
                        <span className="hidden sm:inline">End Meeting</span>
                    </button>
                ) : (
                    <button
                        onClick={handleLeave}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold tracking-tight transition-all active:scale-95 border bg-black border-black text-white hover:bg-white hover:text-black group shadow-md"
                    >
                        <LogOut size={14} className="group-hover:translate-x-1 transition-transform" />
                        <span className="hidden sm:inline">Leave</span>
                    </button>
                )}
            </div>
        </header>
    );
};

export default MeetingHeader;
