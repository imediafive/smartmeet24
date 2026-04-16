import React from 'react';
import { X, User, Crown, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../utils';

const ParticipantsPanel = ({ participants, waitingRoom = [], onApprove, onReject, onAdminMute, onClose, isHost, myId, peerStates }) => {
    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shadow-sm">
                <div>
                    <h3 className="text-xl font-black tracking-tight text-gray-900">Members</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                        {participants.length} PEOPLE IN CALL
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all border-none cursor-pointer"
                >
                    <X size={20} className="text-gray-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
                {/* ── WAITING ROOM SECTION ── */}
                {isHost && waitingRoom.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                WAITING TO JOIN ({waitingRoom.length})
                            </span>
                        </div>
                        <div className="space-y-2">
                            {waitingRoom.map((w) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={w.userId}
                                    className="p-3 bg-orange-50/50 rounded-2xl border border-orange-100/50 flex flex-col gap-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden border-2 border-white">
                                            {w.avatar ? (
                                                <img src={w.avatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} className="text-orange-600" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate text-gray-900">{w.name || 'Guest'}</p>
                                            <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">Wants to enter</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onApprove(w.userId)}
                                            className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors border-none cursor-pointer"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => onReject(w.userId)}
                                            className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors border-none cursor-pointer"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <div className="h-px bg-gray-100 mx-2 mt-4" />
                    </div>
                )}

                {/* ── ACTIVE MEMBERS SECTION ── */}
                <div className="space-y-3">
                    <div className="px-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            In Meeting
                        </span>
                    </div>
                    <div className="space-y-2">
                        {participants.map((p) => {
                            const isMe = String(p.id) === String(myId);
                            const state = peerStates[p.id] || {};
                            const muted = state.muted || state.adminMuted;
                            const videoOff = state.videoOn === false;

                            return (
                                <motion.div
                                    layout
                                    key={p.id}
                                    className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                                >
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                                            {p.userAvatar ? (
                                                <img src={p.userAvatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={18} className="text-gray-400" />
                                            )}
                                        </div>
                                        {p.isHost && (
                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <Crown size={10} className="text-white" fill="currentColor" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-sm truncate text-gray-900">
                                                {p.userName || 'Guest'}
                                            </span>
                                            {isMe && (
                                                <span className="text-[9px] font-black bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 uppercase tracking-widest">
                                                    You
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] font-bold text-gray-400 truncate uppercase tracking-widest mt-0.5">
                                            {p.isHost ? 'Meeting Host' : 'Participant'}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {isHost && !isMe && (
                                            <button
                                                onClick={() => onAdminMute?.(p.id)}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all border-none cursor-pointer"
                                                title="Mute Participant"
                                            >
                                                <MicOff size={16} />
                                            </button>
                                        )}
                                        {muted ? <MicOff size={14} className="text-red-400" /> : <Mic size={14} className="text-gray-300" />}
                                        {videoOff ? <VideoOff size={14} className="text-red-400" /> : <Video size={14} className="text-gray-300" />}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ParticipantsPanel;
