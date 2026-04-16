import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Play, ArrowLeft } from 'lucide-react';
import PremiumButton from '../PremiumButton';
import { motion } from 'framer-motion';
import { mediaManager } from '../mediaManager';
import { cn } from '../utils';
import { useAuthContext } from '../AuthContext';
import MeetingEnded from './MeetingRoom/MeetingEnded';
import { Loader2 } from 'lucide-react';


const PreJoinScreen = ({ roomId, onJoin, onBack }) => {
    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const { getToken, user } = useAuthContext();
    const [status, setStatus] = useState('loading'); // loading, active, ended

    const [meetingInfo, setMeetingInfo] = useState(null);
    const streamRef = useRef(null);
    const videoRef = useRef();

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const token = await getToken();
                const res = await fetch(`${import.meta.env.VITE_API_URL}/meetings/status/${roomId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) {
                    setStatus('active'); // Treat as new/active if not found
                    return;
                }
                const data = await res.json();
                if (data.status === 'ended') {
                    setStatus('ended');
                    setMeetingInfo(data);
                } else {
                    setStatus('active');
                    setMeetingInfo(data);
                }
            } catch (err) {
                setStatus('active'); // fallback
            }
        };
        checkStatus();
    }, [roomId, getToken]);


    useEffect(() => {
        let isMounted = true;
        const startPreview = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    }
                });
                if (!isMounted) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = mediaStream;
                mediaManager.registerStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (err) {
                console.error('Error accessing media devices:', err);
            }
        };
        startPreview();
        return () => {
            isMounted = false;
            mediaManager.unregister(streamRef.current);
            streamRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (audioTrack) audioTrack.enabled = micOn;
            if (videoTrack) videoTrack.enabled = videoOn;
        }
    }, [micOn, videoOn]);

    const handleJoin = () => {
        mediaManager.unregister(streamRef.current);
        streamRef.current = null;
        onJoin({ micOn, videoOn });
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="animate-spin text-black" size={40} />
            </div>
        );
    }

    if (status === 'ended') {
        return (
            <MeetingEnded 
                title={meetingInfo?.title}
                onHome={onBack}
                onNew={() => window.location.href = '/dashboard?new=true'}
            />
        );
    }

    return (

        <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-12 transition-colors duration-500 bg-white text-black">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-4xl flex flex-col items-center gap-12"
            >
                {/* Header Section */}
                <div className="text-center space-y-4">
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Ready to join?</h1>
                    
                    {meetingInfo?.participants?.length > 0 && (
                        <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-700">
                            <div className="flex -space-x-2">
                                {meetingInfo.participants.slice(0, 5).map((p, idx) => (
                                    <div key={idx} className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-gray-100 shadow-sm">
                                        {p.avatar ? (
                                            <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-200 text-[10px] font-bold">
                                                {p.name?.[0]?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {meetingInfo.participants.length > 5 && (
                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-50 flex items-center justify-center text-[10px] font-black text-gray-400">
                                        +{meetingInfo.participants.length - 5}
                                    </div>
                                )}
                            </div>
                            <span className="text-[11px] font-bold text-gray-400 tracking-tight">
                                {meetingInfo.participants.length === 1 ? '1 person is' : `${meetingInfo.participants.length} people are`} already in the meeting
                            </span>
                        </div>
                    )}

                    {!meetingInfo?.participants?.length && (
                        <p className="text-lg font-bold tracking-tight text-black/40">
                            Room: <span className="text-black font-black">{roomId.toUpperCase()}</span>
                        </p>
                    )}
                </div>

                {/* Preview Card */}
                <div className="w-full max-w-2xl aspect-video rounded-[32px] overflow-hidden relative shadow-2xl border-4 transition-all bg-gray-100 border-gray-100">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={cn(
                            "w-full h-full object-cover transform rotate-Y-180 transition-opacity duration-500",
                            videoOn ? "opacity-100" : "opacity-0"
                        )}
                        style={{ transform: 'rotateY(180deg)' }}
                    />

                    {!videoOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-3xl overflow-hidden">
                            <div className="relative w-32 h-32">
                                <motion.div 
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="w-full h-full rounded-full border-2 border-white/20 p-1 bg-white/5 backdrop-blur-xl shadow-2xl relative z-10 overflow-hidden"
                                >
                                    {user?.avatar ? (
                                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-gradient-to-br from-[#8E2DE2] to-[#4A00E0] flex items-center justify-center text-white font-black text-3xl">
                                            {user?.name?.[0] || 'U'}
                                        </div>
                                    )}
                                </motion.div>
                                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-red-500 border-4 border-white/10 flex items-center justify-center text-white shadow-lg z-20">
                                    <VideoOff size={16} />
                                </div>
                            </div>
                        </div>
                    )}


                    {/* Quick Controls overlay */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10 px-6 py-4 rounded-3xl bg-black/20 backdrop-blur-xl border border-white/10">
                        <button
                            onClick={() => setMicOn(!micOn)}
                            className={cn(
                                "w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 border-none cursor-pointer",
                                micOn
                                    ? "bg-white/10 text-white hover:bg-white/20"
                                    : "bg-premium-danger text-white shadow-lg shadow-premium-danger/40"
                            )}
                        >
                            {micOn ? <Mic size={24} /> : <MicOff size={24} />}
                        </button>
                        <button
                            onClick={() => setVideoOn(!videoOn)}
                            className={cn(
                                "w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 border-none cursor-pointer",
                                videoOn
                                    ? "bg-white/10 text-white hover:bg-white/20"
                                    : "bg-premium-danger text-white shadow-lg shadow-premium-danger/40"
                            )}
                        >
                            {videoOn ? <VideoIcon size={24} /> : <VideoOff size={24} />}
                        </button>
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
                    <button
                        onClick={onBack}
                        className="h-14 px-8 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 border-none cursor-pointer flex items-center gap-2 bg-gray-100 text-black hover:bg-gray-200"
                    >
                        <ArrowLeft size={16} /> Go Back
                    </button>

                    <PremiumButton
                        icon={Play}
                        onClick={handleJoin}
                        className="h-14 px-12 text-sm"
                    >
                        Join Session
                    </PremiumButton>
                </div>
            </motion.div>
        </div>
    );
};

export default PreJoinScreen;
