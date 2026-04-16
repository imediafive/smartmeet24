import React, { useState } from 'react';
import {
    Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare,
    Hand, Circle, MessageSquare, PhoneOff, Smile, Sparkles, MonitorPlay, Loader2, StickyNote, Palette,
    MoreHorizontal, X as CloseIcon, PictureInPicture, PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils';

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const MeetingFooter = ({
    micOn, toggleMic, videoOn, toggleVideo, isSharing, toggleShare, handRaised, toggleHand,
    isRecording, startRecording, stopRecording, isScreenRecording, startScreenRecording,
    stopScreenRecording, screenRecSeconds, screenUploading, setShowReacts, onWhiteboard,
    showWhiteboard, panel, setPanel, messages, unread, setUnread, handleLeave, isHost,
    onEnd, hasAiSummary, showTranscript, setShowTranscript, anyoneSharing,
    onPiP, pipActive, onEffects, effectsActive
}) => {
    const [showMore, setShowMore] = useState(false);
    const isLocked = anyoneSharing && !isSharing;

    const PrimaryBtn = ({ onClick, active, icon: Icon, offIcon: OffIcon, label, activeColor = "bg-white", inactiveColor = "bg-gray-100", danger = false, disabled = false, badge }) => (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-10 h-10 sm:w-14 sm:h-14 shrink-0 rounded-xl border transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer relative",
                danger ? "bg-red-500 text-white border-red-600 shadow-md" :
                active ? `${activeColor} text-gray-900 border-gray-200 shadow-sm hover:bg-gray-50` : `${inactiveColor} text-gray-400 border-transparent hover:bg-gray-200`,
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            {active ? <Icon size={18} className="sm:size-[20px]" /> : (OffIcon ? <OffIcon size={18} className="sm:size-[20px]" /> : <Icon size={18} className="sm:size-[20px]" />)}
            <span className="hidden sm:block text-[9px] font-bold tracking-tight mt-1 capitalize">{label}</span>
            {badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-1 border-2 border-white">
                    {badge}
                </span>
            )}
        </button>
    );

    const SecondaryBtn = ({ onClick, active, icon: Icon, label, disabled = false, color = "bg-gray-50" }) => (
        <button
            onClick={() => { onClick(); setShowMore(false); }}
            disabled={disabled}
            className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all active:scale-95 border-none",
                active ? "bg-gray-100 text-black border border-gray-200" : `${color} text-gray-800 hover:bg-gray-200`,
                disabled && "opacity-30 cursor-not-allowed"
            )}
        >
            <Icon size={24} />
            <span className="text-[10px] font-bold capitalize tracking-wide">{label}</span>
        </button>
    );

    return (
        <footer className="z-[100] shrink-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 safe-bottom">
            <div className="max-w-[1600px] mx-auto flex flex-col items-center pt-2 pb-3 sm:py-4 gap-2">
                
                {/* Status Bar */}
                {(isRecording || isScreenRecording || screenUploading) && (
                    <div className="flex items-center gap-4 px-4 py-1">
                        {isRecording && (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                AI Recording
                            </div>
                        )}
                        {isScreenRecording && (
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                Screen {fmtTime(screenRecSeconds || 0)}
                            </div>
                        )}
                        {screenUploading && (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500">
                                <Loader2 size={10} className="animate-spin" />
                                Saving...
                            </div>
                        )}
                    </div>
                )}

                {/* Main Controls Row */}
                <div className="w-full flex justify-center px-4">
                    <div className="flex items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto">
                        
                        {/* Always Visible on Mobile */}
                        <PrimaryBtn onClick={toggleMic} active={micOn} icon={Mic} offIcon={MicOff} label={micOn ? "Mute" : "Unmute"} danger={!micOn} />
                        <PrimaryBtn onClick={toggleVideo} active={videoOn} icon={VideoIcon} offIcon={VideoOff} label={videoOn ? "Stop Cam" : "Start Cam"} danger={!videoOn} />
                        <PrimaryBtn onClick={toggleHand} active={handRaised} icon={Hand} label="Hand" activeColor="bg-yellow-400" />
                        
                        {/* Hidden on Mobile - Desktop only row items */}
                        <div className="hidden sm:flex items-center gap-3">
                            <PrimaryBtn onClick={toggleShare} active={isSharing} icon={ScreenShare} label={isLocked ? "Locked" : "Share"} disabled={isLocked} activeColor="bg-blue-500 !text-white" />
                            {isHost && (
                                <>
                                    <PrimaryBtn onClick={isRecording ? stopRecording : startRecording} active={isRecording} icon={Circle} label="AI Recording" activeColor="bg-red-500 !text-white" />
                                    <PrimaryBtn onClick={isScreenRecording ? stopScreenRecording : startScreenRecording} active={isScreenRecording} icon={screenUploading ? Loader2 : MonitorPlay} label={screenUploading ? "Saving" : "Rec"} disabled={screenUploading} activeColor="bg-blue-500 !text-white" />
                                </>
                            )}
                        </div>

                        <div className="hidden sm:block w-px h-8 bg-gray-200 mx-1" />

                        <div className="hidden sm:flex items-center gap-3">
                            <PrimaryBtn onClick={() => setShowReacts(true)} icon={Smile} label="Reacts" />
                            <PrimaryBtn 
                                onClick={onWhiteboard} 
                                active={showWhiteboard} 
                                icon={Palette} 
                                label={anyoneSharing ? "Locked" : "Board"} 
                                disabled={anyoneSharing} 
                                activeColor="bg-amber-500" 
                            />
                            <PrimaryBtn onClick={() => { setPanel(panel === 'notes' ? null : 'notes'); }} active={panel === 'notes'} icon={StickyNote} label="Notes" activeColor="bg-amber-400 !text-black" />
                            <PrimaryBtn onClick={onEffects} active={effectsActive} icon={Sparkles} label="Effects" activeColor="bg-purple-500 !text-white" />
                            <PrimaryBtn onClick={onPiP} active={pipActive} icon={PictureInPicture} label="PiP" activeColor="bg-premium-accent" />
                        </div>

                        {/* Chat is always visible or in menu? Let's keep it visible for alerts */}
                        <PrimaryBtn 
                            onClick={() => { setPanel(panel === 'chat' ? null : 'chat'); setUnread(0); }} 
                            active={panel === 'chat'} 
                            icon={MessageSquare} 
                            label="Chat" 
                            badge={unread} 
                        />

                        {/* More Button (Mobile Only) */}
                        <button
                            onClick={() => setShowMore(true)}
                            className="sm:hidden w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-900 transition-all active:scale-95"
                        >
                            <MoreHorizontal size={20} />
                        </button>

                        <PrimaryBtn onClick={isHost ? onEnd : handleLeave} danger icon={PhoneOff} label={isHost ? "End" : "Leave"} />
                    </div>
                </div>

                {/* Mobile "More" Menu Overlay */}
                <AnimatePresence>
                    {showMore && (
                        <div className="fixed inset-0 z-[1000] sm:hidden">
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }}
                                onClick={() => setShowMore(false)}
                                className="absolute inset-0 bg-black/80 backdrop-blur-md" 
                            />
                            <motion.div 
                                initial={{ y: '100%' }} 
                                animate={{ y: 0 }} 
                                exit={{ y: '100%' }}
                                className="absolute bottom-0 inset-x-0 bg-white rounded-t-[32px] p-8 border-t border-gray-100"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-gray-900 font-bold text-xl tracking-tight">More Options</h3>
                                    <button onClick={() => setShowMore(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-900">
                                        <CloseIcon size={20} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <SecondaryBtn onClick={toggleShare} active={isSharing} icon={ScreenShare} label="Share" disabled={isLocked} />
                                    <SecondaryBtn onClick={() => setShowReacts(true)} icon={Smile} label="Reacts" />
                                    <SecondaryBtn onClick={onWhiteboard} active={showWhiteboard} icon={Palette} label={anyoneSharing ? "Locked" : "Board"} disabled={anyoneSharing} />
                                    <SecondaryBtn onClick={() => setPanel('notes')} active={panel === 'notes'} icon={StickyNote} label="Notes" />
                                    <SecondaryBtn onClick={onEffects} active={effectsActive} icon={Sparkles} label="Effects" />
                                    <SecondaryBtn onClick={() => { setPanel('chat'); }} icon={PieChart} label="Polls" />
                                    {hasAiSummary && <SecondaryBtn onClick={() => setShowTranscript(!showTranscript)} active={showTranscript} icon={Sparkles} label="AI Panel" />}
                                    
                                    {isHost && (
                                        <>
                                            <SecondaryBtn onClick={isRecording ? stopRecording : startRecording} active={isRecording} icon={Circle} label="AI Recording" color="bg-red-500/20" />
                                            <SecondaryBtn onClick={isScreenRecording ? stopScreenRecording : startScreenRecording} active={isScreenRecording} icon={MonitorPlay} label="Screen Rec" color="bg-blue-500/20" />
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </footer>
    );
};

export default MeetingFooter;
