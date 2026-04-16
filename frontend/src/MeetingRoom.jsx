import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMediasoup } from './hooks/useMediasoup';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useAuthContext } from './AuthContext';
import { cn } from './utils';

import UserTile, { RemoteVideoPlayer, ScreenSharePlayer } from './components/MeetingRoom/UserTile';
import FloatingReaction from './components/MeetingRoom/FloatingReaction';
import ChatPanel from './components/MeetingRoom/ChatPanel';
import InviteModal from './components/MeetingRoom/InviteModal';
import SelectionModal from './components/MeetingRoom/SelectionModal';
import MeetingFooter from './components/MeetingRoom/MeetingFooter';
import MeetingHeader from './components/MeetingRoom/MeetingHeader';
import BotHUD from './components/MeetingRoom/BotHUD';
import SummarySidebar from './components/MeetingRoom/SummarySidebar';
import NotesPanel from './components/MeetingRoom/NotesPanel';
import ParticipantsPanel from './components/MeetingRoom/ParticipantsPanel';
import Whiteboard from './components/MeetingRoom/Whiteboard';
import MeetingEnded from './components/MeetingRoom/MeetingEnded';
import VideoEffects from './components/MeetingRoom/VideoEffects';
import { applyFilterToStream, FILTERS as EFFECT_STYLES } from './utils/MediaProcessor';
import { mediaManager } from './mediaManager';

import { REACTIONS } from './components/MeetingRoom/Constants';
import { ScreenShare, PhoneOff, Loader2, Users, Palette } from 'lucide-react';

// Agora and Pusher setup removed
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const MeetingRoom = ({ roomId, onLeave, initialConfig, isHost: initialIsHost = false, setIsHost: setRootIsHost }) => {
    const { user, getToken } = useAuthContext();

    const [micOn, setMicOn] = useState(initialConfig?.micOn ?? true);
    const [videoOn, setVideoOn] = useState(initialConfig?.videoOn ?? true);
    const [remoteUsers, setRemoteUsers] = useState([]);
    const [peerStates, setPeerStates] = useState({});
    const [messages, setMessages] = useState([]);
    const [reactions, setReactions] = useState([]);
    const [panel, setPanel] = useState(null);
    const panelRef = useRef(null);
    const [unread, setUnread] = useState(0);
    const [handRaised, setHandRaised] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [activeSpeaker, setActiveSpeaker] = useState(null);
    const [endMessage, setEndMessage] = useState(null);
    const [adminMuted, setAdminMuted] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [activeFilter, setActiveFilter] = useState('none');
    const processedStreamRef = useRef(null);
    const [showReacts, setShowReacts] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [isEnded, setIsEnded] = useState(false);
    const [notifications, setNotifications] = useState([]); // kept for backward compatibility if any
    const [personalNotes, setPersonalNotes] = useState('');
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);
    const [meetingTitle, setMeetingTitle] = useState(`Meeting ${roomId.toUpperCase()}`);
    const [localStream, setLocalStream] = useState(null);
    const [isHost, setIsHostLocal] = useState(initialIsHost || sessionStorage.getItem(`host_${roomId}`) === 'true');
    const isHostRef = useRef(isHost);
    const isMountedRef = useRef(true);
    const [pipWindow, setPipWindow] = useState(null);

    const setIsHost = useCallback((val) => {
        setIsHostLocal(val);
        isHostRef.current = val;
        if (setRootIsHost) setRootIsHost(val);
        sessionStorage.setItem(`host_${roomId}`, String(val));
    }, [roomId, setRootIsHost]);

    const normalizedRoomId = useMemo(() => roomId?.toLowerCase()?.trim(), [roomId]);
    const [whiteboardDrawData, setWhiteboardDrawData] = useState(null);

    const sharedAudioCtx = useRef(null);
    useEffect(() => {
        const handleInteraction = () => {
            if (!sharedAudioCtx.current) {
                sharedAudioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (sharedAudioCtx.current.state === 'suspended') {
                sharedAudioCtx.current.resume();
            }
            document.querySelectorAll('video, audio').forEach(v => {
                try { if (v.paused) v.play().catch(() => { }); } catch (e) { }
            });
        };
        window.addEventListener('click', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);
        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
            if (sharedAudioCtx.current) sharedAudioCtx.current.close().catch(() => {});
        };
    }, []);

    const upsertUser = useCallback((id, part) => {
        if (!id) return;
        const strId = String(id);
        const myId = String(user?.id || user?._id || '');
        if (strId === myId || strId === 'me') return;

        setRemoteUsers(prev => {
            const existing = prev.find(u => String(u.id) === strId);
            const filtered = prev.filter(u => String(u.id) !== strId);

            // Save streams completely separately to avoid browser track-merge muting issues!
            const nextUser = {
                ...(existing || {}),
                ...part,
                id: strId,
                userName: part.userName || part.name || existing?.userName || '...',
                userAvatar: part.userAvatar || part.avatar || existing?.userAvatar || '/defaultpic.png',
                videoStream: part.videoStream !== undefined ? part.videoStream : existing?.videoStream,
                audioStream: part.audioStream !== undefined ? part.audioStream : existing?.audioStream,
                screenStream: part.screenStream !== undefined ? part.screenStream : existing?.screenStream,
                videoProducerId: part.videoProducerId || existing?.videoProducerId,
                audioProducerId: part.audioProducerId || existing?.audioProducerId,
                screenProducerId: part.screenProducerId || existing?.screenProducerId,
                socketId: part.socketId || existing?.socketId
            };
            return [...filtered, nextUser];
        });
    }, [user?.id, user?._id]);

    const syncStateRef = useRef(null);
    const usersMapRef = useRef({});

    useEffect(() => {
        const map = {};
        remoteUsers.forEach(u => {
            map[String(u.id)] = u.userName || u.name;
        });
        usersMapRef.current = map;
    }, [remoteUsers]);

    const sfuCallbacks = useMemo(() => ({
        onRemoteStream: (producerId, stream, peerData) => {
            if (peerData.type === 'screen') {
                upsertUser(peerData.userId, { screenStream: stream, screenProducerId: producerId, userName: peerData.userName, userAvatar: peerData.userAvatar });
            } else if (peerData.type === 'camera') {
                upsertUser(peerData.userId, { videoStream: stream, videoProducerId: producerId, userName: peerData.userName, userAvatar: peerData.userAvatar });
            } else {
                upsertUser(peerData.userId, { audioStream: stream, audioProducerId: producerId, userName: peerData.userName, userAvatar: peerData.userAvatar });
            }
        },
        onUserLeft: (socketId) => {
            setRemoteUsers(p => {
                const userToCleanup = p.find(x => x.socketId === socketId);
                if (userToCleanup && audioAnalyzers.current[userToCleanup.id]) {
                    try {
                        const { source, analyzer } = audioAnalyzers.current[userToCleanup.id];
                        source.disconnect();
                        analyzer.disconnect();
                        delete audioAnalyzers.current[userToCleanup.id];
                    } catch (e) { }
                }
                return p.filter(x => x.socketId !== socketId);
            });
        },
        onMessage: (d) => {
            const myId = user?.id || user?._id;
            if (String(d.senderId) === String(myId)) return;
            setMessages(p => [...p, { id: Date.now(), from: d.senderId, userName: d.senderName, text: d.text, userAvatar: d.senderAvatar, isPrivate: d.isPrivate, recipientId: d.recipientId, recipientName: d.recipientName }]);
            setUnread(v => v + 1);
        },
        onReaction: (d) => {
            const id = Date.now();
            // Deep lookup: Check payload first, then current participants map
            const nameFromMap = usersMapRef.current[String(d.userId)];
            const displayName = (d.userName || nameFromMap || '').trim();
            setReactions(p => [...p, { id, ...d, name: displayName }]);
        },
        onWhiteboardDraw: (d) => setWhiteboardDrawData(d),
        onWhiteboardClear: () => setWhiteboardDrawData({ type: 'clear' }),
        onWhiteboardToggle: (d) => {
            const myId = user?.id || user?._id;
            if (String(d.senderId) !== String(myId)) setShowWhiteboardLocal(d.visible);
        },
        onProducerClosed: (producerId, pUserId) => {
            if (audioAnalyzers.current[pUserId]) {
                const u = usersMapRef.current[pUserId] || {}; // not actually needed for check, but let's be clean
                // We'll check if the closed producer matches the audio producer id in the remoteUsers state 
                // but simpler: if it's the audio producer closing, we kill the analyzer.
            }

            setRemoteUsers(prev => prev.map(u => {
                if (String(u.id) === String(pUserId)) {
                    const isVideo = u.videoProducerId === producerId;
                    const isAudio = u.audioProducerId === producerId;

                    if (isAudio && audioAnalyzers.current[pUserId]) {
                        try {
                            const { source, analyzer } = audioAnalyzers.current[pUserId];
                            source.disconnect();
                            analyzer.disconnect();
                            delete audioAnalyzers.current[pUserId];
                        } catch (e) { }
                    }

                    const isScreen = u.screenProducerId === producerId;
                    
                    return {
                        ...u,
                        videoStream: isVideo ? null : u.videoStream,
                        audioStream: isAudio ? null : u.audioStream,
                        screenStream: isScreen ? null : u.screenStream,
                        videoProducerId: isVideo ? null : u.videoProducerId,
                        audioProducerId: isAudio ? null : u.audioProducerId,
                        screenProducerId: isScreen ? null : u.screenProducerId
                    };
                }
                return u;
            }));
        },
        onWaitingRoomUpdate: (wr) => {
            setWaitingRoom(prev => {
                if (isHostRef.current && wr && prev && wr.length > prev.length) {
                    const newest = wr[wr.length - 1];
                    toast.custom((t) => (
                        <div className="bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 min-w-[300px] animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-premium-accent/10 border border-premium-accent/20 flex items-center justify-center text-premium-accent">
                                    <Users size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-extrabold text-gray-900 text-[13px] uppercase tracking-tight">Join Request</span>
                                    <span className="text-[11px] text-gray-400 font-bold">{newest.name} wants to join</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => { approveParticipant(newest.userId); toast.dismiss(t); }}
                                    className="flex-1 py-2 bg-black hover:bg-gray-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95"
                                >
                                    Approve
                                </button>
                                <button 
                                    onClick={() => { rejectParticipant(newest.userId); toast.dismiss(t); }}
                                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95"
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                    ), { position: 'top-center', duration: 8000 });
                    try { new Audio('/Soundeffects/requesttojoinin.mp3').play().catch(e => console.log('Audio play blocked:', e)); } catch (e) { }
                }
                return wr || [];
            });
        },
        onUserJoined: (d) => {
            const myId = user?.id || user?._id;
            if (String(d.userId) !== String(myId)) {
                upsertUser(d.userId, { userName: d.userName, userAvatar: d.userAvatar, socketId: d.socketId });
                try { new Audio('/Soundeffects/joiningin.mp3').play().catch(e => console.log('Audio play blocked:', e)); } catch (e) { }
                syncStateRef.current?.();
            }
        },
        onProfileUpdate: (d) => {
            const myId = user?.id || user?._id;
            if (String(d.userId) !== String(myId)) {
                upsertUser(d.userId, { userName: d.userName, userAvatar: d.userAvatar });
            }
        },
        onAiUpdate: (d) => { if (d.summary) { setSummary(d.summary); setTranscript(d); setBotPhase('idle'); } },
        onNewPoll: (payload) => {
            console.log('[SFU] New Poll Received:', payload);
            setMessages(prev => {
                const exists = prev.some(m => m.type === 'poll' && m.poll.id === payload.poll.id);
                if (exists) return prev;
                return [...prev, payload]; // Just add to flow
            });

            // Professional Card-Style Popup at Bottom-Center
            toast.dismiss();
            toast.custom((t) => (
                <div className="bg-white border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-5 flex flex-col gap-4 min-w-[320px] animate-in slide-in-from-bottom duration-500">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-premium-accent/10 flex items-center justify-center text-premium-accent shrink-0">
                            <BarChart2 size={24} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-gray-900 text-[14px] uppercase tracking-tighter">New Poll Launched</span>
                            <span className="text-[11px] text-gray-400 font-bold">By {payload.poll.creatorName}</span>
                        </div>
                    </div>
                    <div className="h-px bg-gray-50 -mx-5" />
                    <button 
                        onClick={() => { setPanel('chat'); toast.dismiss(t); }}
                        className="w-full py-3 bg-black hover:bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-black/10"
                    >
                        View & Vote Now
                    </button>
                </div>
            ), { position: 'bottom-center', duration: 10000 });
        },
        onPollVote: (payload) => {
            console.log('[SFU] Poll Vote Received:', payload);
            const { pollId, optionIndex, userId: voterId } = payload;
            setMessages(prev => prev.map(m => {
                if (m.type === 'poll' && m.poll.id === pollId) {
                    const nextOptions = [...m.poll.options];
                    nextOptions.forEach(opt => opt.votes = opt.votes.filter(id => id !== voterId));
                    nextOptions[optionIndex].votes.push(voterId);
                    return { ...m, poll: { ...m.poll, options: nextOptions } };
                }
                return m;
            }));
        },
        onPollClosed: ({ pollId }) => {
            setMessages(prev => {
                const pollMsg = prev.find(m => m.type === 'poll' && m.poll.id === pollId);
                if (!pollMsg) return prev;

                // Update ALL instances in history (original)
                const nextMessages = prev.map(m => {
                    if (m.type === 'poll' && m.poll.id === pollId) {
                        return { ...m, poll: { ...m.poll, status: 'closed' } };
                    }
                    return m;
                });

                // ALWAYS Append a fresh results entry to the bottom as requested
                const resultEntry = {
                    ...pollMsg,
                    id: `res_${pollId}_${Date.now()}`,
                    timestamp: new Date(),
                    poll: { ...pollMsg.poll, status: 'closed' }
                };

                return [...nextMessages, resultEntry];
            });

            // Professional Card-Style Popup at Bottom-Center (matching Leave Meeting)
            toast.dismiss();
            toast.custom((t) => (
                <div className="bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-5 flex flex-col gap-4 min-w-[320px] animate-in slide-in-from-bottom duration-500">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                            <PieChart size={24} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-gray-900 text-[14px] uppercase tracking-tighter">Poll Results Finalized</span>
                            <span className="text-[11px] text-gray-400 font-bold">The poll has ended. See the summary below.</span>
                        </div>
                    </div>
                    <div className="h-px bg-gray-50 -mx-5" />
                    <button 
                        onClick={() => { setPanel('chat'); toast.dismiss(t); }}
                        className="w-full py-3 bg-black hover:bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-black/10"
                    >
                        Check Final Results
                    </button>
                </div>
            ), { position: 'bottom-center', duration: 8000 });
        },
        onStateUpdate: (d) => {
            const myId = user?.id || user?._id;
            if (String(d.uid) !== String(myId)) setPeerStates(p => ({ ...p, [d.uid]: d.state }));
        },
        onAdminMute: (d) => {
            const myId = user?.id || user?._id || 'me';
            if (String(d.targetUserId) === String(myId)) {
                setAdminMuted(true);
                setMicOn(false);
                stopMic();
                toast.warning('Muted by Admin', { description: 'The host has locked your microphone.' });
                syncState({ muted: true, adminMuted: true });
            }
        },
        onAdminUnmute: (d) => {
            const myId = user?.id || user?._id || 'me';
            if (String(d.targetUserId) === String(myId)) {
                setAdminMuted(false);
                toast.success('Unmuted by Admin', { description: 'The host has unlocked your microphone.' });
                syncState({ adminMuted: false });
            }
        },
        onMeetingEnded: () => setIsEnded(true),
        onHostStatus: (val) => setIsHost(val),
        onScreenShareEnded: () => {
            setIsSharing(false);
            screenStreamRef.current = null;
            stateRef.current.isSharing = false;
            syncStateRef.current?.({ screenSharing: false });
        },
        onInitialStateSync: (states) => {
            setPeerStates(prev => ({ ...prev, ...states }));
        },
        onHistorySync: ({ messages: historyMessages, polls: historyPolls }) => {
            const combined = [...(historyMessages || []), ...(historyPolls || [])]
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            setMessages(combined);
        },
        onJoinError: (err) => {
            if (err === 'Meeting has already ended') {
                setIsEnded(true);
            } else {
                toast.error(err || 'Failed to join meeting');
            }
        }
    }), [user?.id, user?._id, upsertUser]);

    const {
        peers: sfuPeers,
        localStream: sfuLocalStream,
        isPending: sfuIsPending,
        sendMessage: sfuSendMessage,
        updateState: sfuUpdateState,
        sendReaction: sfuSendReaction,
        sendWhiteboardDraw: sfuSendWhiteboardDraw,
        sendWhiteboardClear: sfuSendWhiteboardClear,
        sendWhiteboardToggle: sfuSendWhiteboardToggle,
        sendPoll: sfuSendPoll,
        votePoll: sfuVotePoll,
        replaceVideoTrack,
        shareScreen,
        stopShareScreen,
        startCamera,
        stopCamera,
        startMic,
        stopMic,
        sendAdminMute,
        sendAdminUnmute,
        socket: sfuSocket
    } = useMediasoup(normalizedRoomId, user, sfuCallbacks, { micOn, videoOn });

    useEffect(() => {
        if (sfuLocalStream) {
            setLocalStream(sfuLocalStream);
            localStreamRef.current = sfuLocalStream;
        }
    }, [sfuLocalStream]);


    const [showWhiteboard, setShowWhiteboardLocal] = useState(false);


    const setShowWhiteboard = useCallback(async (val, sync = true) => {
        setShowWhiteboardLocal(val);
        if (sync) sfuSendWhiteboardToggle(val);
    }, [sfuSendWhiteboardToggle]);


    const [isRecording, setIsRecording] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [botRunning, setBotRunning] = useState(false);
    const [transcript, setTranscript] = useState(null);
    const [showTranscript, setShowTranscript] = useState(false);
    const [isPending, setIsPending] = useState(false);
    useEffect(() => { setIsPending(sfuIsPending); }, [sfuIsPending]);

    const [waitingRoom, setWaitingRoom] = useState([]);
    const [botPhase, setBotPhase] = useState('idle');
    const [phaseMsg, setPhaseMsg] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [summary, setSummary] = useState(null);
    const [isScreenRecording, setIsScreenRecording] = useState(false);
    const [screenRecSeconds, setScreenRecSeconds] = useState(0);
    const [screenUploading, setScreenUploading] = useState(false);

    const socketRef = useRef(null);
    const peersRef = useRef({}); // socketId -> { peer, userId, userName }
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const rtmReady = useRef(false);
    const mediaRecorder = useRef(null);
    const recChunks = useRef([]);
    const recTimer = useRef(null);
    const audioContext = useRef(null);
    const recDestination = useRef(null);
    const connectedNodes = useRef({});
    const screenMediaRecorder = useRef(null);
    const screenRecChunks = useRef([]);
    const screenRecTimer = useRef(null);
    const screenRecSeconds_ref = useRef(0);

    const profileRef = useRef({ name: '', pic: '' });
    useEffect(() => {
        profileRef.current = { name: user?.name, pic: user?.avatar };
    }, [user?.name, user?.avatar]);

    const stateRef = useRef({ micOn, videoOn, handRaised, adminMuted, isSharing });
    useEffect(() => { stateRef.current = { micOn, videoOn, handRaised, adminMuted, isSharing }; }, [micOn, videoOn, handRaised, adminMuted, isSharing]);

    const myData = useMemo(() => ({
        id: user?.id || user?._id || 'me',
        userName: user?.name || 'You',
        userAvatar: user?.avatar,
        videoStream: localStream ? new MediaStream(localStream.getVideoTracks()) : null,
        audioStream: localStream ? new MediaStream(localStream.getAudioTracks()) : null,
        videoOn,
        micOn
    }), [user?.id, user?._id, user?.name, user?.avatar, localStream, videoOn, micOn]);
    const sharingRemoteUser = useMemo(() => {
        return remoteUsers.find(u => !!u.screenStream);
    }, [remoteUsers]);

    const deduplicatedRemoteUsers = useMemo(() => {
        const seen = new Set();
        return remoteUsers.filter(u => {
            const id = String(u.id);
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        }).sort((a, b) => {
            if (a.screenStream && !b.screenStream) return -1;
            if (!a.screenStream && b.screenStream) return 1;
            if (activeSpeaker === a.id) return -1;
            if (activeSpeaker === b.id) return 1;
            const aHand = peerStates[a.id]?.handRaised;
            const bHand = peerStates[b.id]?.handRaised;
            if (aHand && !bHand) return -1;
            if (!aHand && bHand) return 1;
            const aVideo = peerStates[a.id]?.videoOn !== false && !!a.videoStream;
            const bVideo = peerStates[b.id]?.videoOn !== false && !!b.videoStream;
            if (aVideo && !bVideo) return -1;
            if (!aVideo && bVideo) return 1;
            return 0;
        });
    }, [remoteUsers, activeSpeaker, peerStates]);


    const screenFeed = useMemo(() => {
        if (isSharing) return screenStreamRef.current;
        return sharingRemoteUser?.screenStream;
    }, [isSharing, sharingRemoteUser]);

    const anyoneSharing = isSharing || !!sharingRemoteUser;

    // LOCK: If someone starts sharing screen, force close the whiteboard local state
    useEffect(() => {
        if (anyoneSharing && showWhiteboard) {
            setShowWhiteboardLocal(false);
        }
    }, [anyoneSharing, showWhiteboard]);

    const showStage = anyoneSharing || showWhiteboard;



    // --- ACTIVE SPEAKER DETECTION ---
    const audioAnalyzers = useRef({}); // userId -> analyzer
    useEffect(() => {
        const checkVolumes = () => {
            let loudestPeer = null;
            let maxVolume = -Infinity;

            // Check Local
            if (localStreamRef.current && stateRef.current.micOn) {
                const vol = getVolume('me', localStreamRef.current);
                if (vol > 15) { // Lower threshold for better sensitivity
                    loudestPeer = 'me';
                    maxVolume = vol;
                }
            }

            // Check Remotes
            deduplicatedRemoteUsers.forEach(u => {
                if (u.audioStream) {
                    const vol = getVolume(u.id, u.audioStream);
                    if (vol > 15 && vol > maxVolume) {
                        loudestPeer = u.id;
                        maxVolume = vol;
                    }
                }
            });

            if (loudestPeer !== activeSpeaker) {
                setActiveSpeaker(loudestPeer);
            }
        };

        const getVolume = (uid, stream) => {
            try {
                if (!sharedAudioCtx.current || sharedAudioCtx.current.state === 'closed') {
                    sharedAudioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
                }
                const ctx = sharedAudioCtx.current;

                if (!audioAnalyzers.current[uid]) {
                    const source = ctx.createMediaStreamSource(stream);
                    const analyzer = ctx.createAnalyser();
                    analyzer.fftSize = 256;
                    analyzer.smoothingTimeConstant = 0.5;
                    source.connect(analyzer);
                    
                    // Critical Fix: Bridge remote audio to hardware destination!
                    // We must NEVER connect locally produced audio ('me') back to the speakers here, 
                    // as it would cause echo/feedback for the user themselves.
                    if (uid !== 'me') {
                        source.connect(ctx.destination);
                    }

                    audioAnalyzers.current[uid] = { 
                        analyzer, 
                        data: new Uint8Array(analyzer.frequencyBinCount),
                        source 
                    };
                }
                const { analyzer, data } = audioAnalyzers.current[uid];
                analyzer.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                return sum / data.length;
            } catch (e) { return 0; }
        };

        const timer = setInterval(checkVolumes, 200); // 5 times per second for responsive UI
        return () => {
            clearInterval(timer);
        };
    }, [deduplicatedRemoteUsers, activeSpeaker]);

    const MAX_GRID_USERS = 4;
    const visibleGridUsers = useMemo(() => {
        return deduplicatedRemoteUsers.slice(0, MAX_GRID_USERS);
    }, [deduplicatedRemoteUsers]);

    const visibleStripUsers = useMemo(() => {
        return deduplicatedRemoteUsers.slice(0, 12);
    }, [deduplicatedRemoteUsers]);


    const sendMsg = useCallback(async (txt, recipientId = 'all') => {
        if (!txt?.trim()) return;
        const recipientName = recipientId === 'all' ? 'Everyone' :
            (remoteUsers.find(u => String(u.id) === String(recipientId))?.userName || 'Participant');

        const msg = {
            senderName: user?.name || 'Guest',
            senderAvatar: user?.avatar,
            text: txt,
            recipientId: recipientId,
            recipientName: recipientName,
            isPrivate: recipientId !== 'all'
        };
        setMessages(p => [...p, {
            id: Date.now(),
            from: user?.id || 'me',
            userName: msg.senderName,
            text: txt,
            userAvatar: msg.senderAvatar,
            recipientId,
            recipientName,
            isPrivate: msg.isPrivate
        }]);
        sfuSendMessage(msg);
    }, [normalizedRoomId, user?.name, user?.avatar, user?.id, remoteUsers, sfuSendMessage]);


    const updateTitle = useCallback(async (newTitle) => {
        if (!newTitle?.trim() || !isHost) return;
        setMeetingTitle(newTitle);
        try {
            const token = await getToken();
            await fetch(`${import.meta.env.VITE_API_URL}/meetings/title/${normalizedRoomId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: newTitle, senderId: user?.id })
            });
        } catch (e) { }
    }, [getToken, normalizedRoomId, isHost, user?.id]);

    const saveNotes = useCallback(async (content) => {
        if (!isMountedRef.current) return;
        setIsSavingNotes(true);
        try {
            const token = await getToken();
            await fetch(`${import.meta.env.VITE_API_URL}/meetings/notes/${normalizedRoomId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ content })
            });
        } catch (e) { } finally {
            if (isMountedRef.current) setIsSavingNotes(false);
        }
    }, [getToken, normalizedRoomId]);

    // Handle Notes Auto-save
    useEffect(() => {
        const timer = setTimeout(() => {
            if (personalNotes !== '') { // Don't auto-save empty on mount
                saveNotes(personalNotes);
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [personalNotes, saveNotes]);

    const mergeProfile = useCallback((uid, profile) => {
        if (String(uid) === String(user?.id)) return;
        setRemoteUsers(prev => {
            const idx = prev.findIndex(u => String(u.id) === String(uid));
            if (idx > -1) {
                const updated = [...prev];
                const pName = profile.name || profile.userName;
                const finalName = (pName && pName !== 'Guest' && pName !== 'Connecting...') ? pName : updated[idx].userName;
                updated[idx] = {
                    ...updated[idx],
                    ...profile,
                    userName: finalName,
                    userAvatar: profile.pic || profile.avatar || profile.userAvatar || updated[idx].userAvatar
                };
                return updated;
            }
            return prev;
        });
    }, [user?.id]);

    const syncState = useCallback(async (state) => {
        const myUid = user?.id || user?._id || 'me';
        const nextState = {
            muted: !stateRef.current.micOn,
            videoOn: stateRef.current.videoOn,
            handRaised: stateRef.current.handRaised,
            adminMuted: stateRef.current.adminMuted,
            screenSharing: stateRef.current.isSharing,
            ...state
        };
        setPeerStates(p => ({ ...p, [myUid]: nextState }));
        sfuUpdateState(nextState);
    }, [user?.id, user?._id, sfuUpdateState]);
    syncStateRef.current = syncState;

    // Sync initial state once socket is ready and local state is set
    useEffect(() => {
        if (sfuSocket?.current?.connected) {
            syncState();
        }
    }, [sfuSocket?.current?.connected, syncState]);


    const broadcastProfile = useCallback(async () => {
        if (sfuSocket?.current) {
            sfuSocket.current.emit('profile-update', {
                userId: user?.id,
                userName: profileRef.current.name || 'User',
                userAvatar: profileRef.current.pic || '/defaultpic.png'
            });
        }
        // still keep the REST call if needed for persistence
        const token = await getToken();
        fetch(`${import.meta.env.VITE_API_URL}/meetings/profile/${normalizedRoomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                userId: user?.id,
                userName: profileRef.current.name || 'User',
                userAvatar: profileRef.current.pic || '/defaultpic.png'
            })
        }).catch(() => { });
    }, [getToken, normalizedRoomId, user?.id, sfuSocket]);

    const sendReact = useCallback((key) => {
        const id = Date.now();
        sfuSendReaction(key);
        // Show locally for the sender immediately
        setReactions(p => [...p, { 
            id, 
            key, 
            userId: user?.id || user?._id || 'me', 
            name: user?.name || 'You' 
        }]);
        setShowReacts(false);
    }, [sfuSendReaction, user?.id, user?._id, user?.name]);


    const toggleMic = useCallback(async () => {
        if (stateRef.current.adminMuted) return;
        const next = !micOn;
        setMicOn(next);
        if (next) {
            await startMic();
        } else {
            await stopMic();
        }
        syncState({ muted: !next });
    }, [micOn, startMic, stopMic, syncState]);

    const toggleVideo = useCallback(async () => {
        const next = !videoOn;
        setVideoOn(next);
        if (next) {
            await startCamera();
        } else {
            await stopCamera();
        }
        syncState({ videoOn: next });
    }, [videoOn, startCamera, stopCamera, syncState]);

    const toggleHand = useCallback(() => {
        const next = !handRaised;
        setHandRaised(next);
        syncState({ handRaised: next });
    }, [handRaised, syncState]);

    const toggleShare = useCallback(async () => {
        if (!isSharing) {
            const stream = await shareScreen();
            if (stream) {
                setIsSharing(true);
                screenStreamRef.current = stream;
            }
        } else {
            await stopShareScreen();
            setIsSharing(false);
            screenStreamRef.current = null;
        }
    }, [isSharing, shareScreen, stopShareScreen]);

    const approveParticipant = useCallback(async (targetUserId) => {
        try {
            const token = await getToken();
            await fetch(`${import.meta.env.VITE_API_URL}/meetings/approve/${normalizedRoomId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ targetUserId })
            });
        } catch (e) { }
    }, [getToken, normalizedRoomId]);

    const rejectParticipant = useCallback(async (targetUserId) => {
        try {
            const token = await getToken();
            await fetch(`${import.meta.env.VITE_API_URL}/meetings/reject/${normalizedRoomId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ targetUserId })
            });
        } catch (e) { }
    }, [getToken, normalizedRoomId]);



    const handleLeave = async () => {
        if (isRecording) await stopRecording();
        const token = await getToken();
        await fetch(`${import.meta.env.VITE_API_URL}/meetings/leave/${normalizedRoomId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => { });
        onLeave();
    };

    const handleEndMeeting = async () => {
        if (isRecording) await stopRecording();
        try {
            const token = await getToken();
            await fetch(`${import.meta.env.VITE_API_URL}/meetings/end/${normalizedRoomId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        } catch (err) { }
        onLeave();
    };

    const confirmEndMeeting = () => {
        toast.dismiss(); // Clear any existing toasts to prevent stacking
        toast.custom((t) => (
            <div className="bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 min-w-[280px] sm:min-w-[320px]">
                <div className="flex flex-col gap-1">
                    <span className="font-extrabold text-gray-900 text-sm sm:text-base">End session for all?</span>
                    <span className="text-[11px] text-gray-400 font-bold">This will disconnect everyone and stop processing immediately.</span>
                </div>
                <div className="flex gap-2.5">
                    <button
                        onClick={() => { handleEndMeeting(); toast.dismiss(t); }}
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] transition-all active:scale-95 shadow-lg shadow-red-200"
                    >
                        End Meeting
                    </button>
                    <button
                        onClick={() => toast.dismiss(t)}
                        className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold text-[11px] transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        ), { duration: Infinity, position: 'bottom-center' });
    };

    const confirmLeaveMeeting = () => {
        toast.dismiss(); // Clear any existing toasts to prevent stacking
        toast.custom((t) => (
            <div className="bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 min-w-[280px] sm:min-w-[320px]">
                <div className="flex flex-col gap-1">
                    <span className="font-extrabold text-gray-900 text-sm sm:text-base">Leave this meeting?</span>
                    <span className="text-[11px] text-gray-400 font-bold">You can rejoin later if the session is still active.</span>
                </div>
                <div className="flex gap-2.5">
                    <button
                        onClick={() => { handleLeave(); toast.dismiss(t); }}
                        className="flex-1 py-2.5 bg-black hover:bg-gray-900 text-white rounded-xl font-bold text-[11px] transition-all active:scale-95 shadow-lg shadow-gray-200"
                    >
                        Leave Now
                    </button>
                    <button
                        onClick={() => toast.dismiss(t)}
                        className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold text-[11px] transition-all active:scale-95"
                    >
                        Stay
                    </button>
                </div>
            </div>
        ), { duration: Infinity, position: 'bottom-center' });
    };

    const toggleMeetingPiP = async () => {
        if (!('documentPictureInPicture' in window)) {
            toast.error("Picture-in-Picture not supported in this browser");
            return;
        }

        if (pipWindow) {
            pipWindow.close();
            setPipWindow(null);
            return;
        }

        try {
            const w = await window.documentPictureInPicture.requestWindow({
                width: 340,
                height: 500,
            });

            // Copy styles from main document
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    w.document.head.appendChild(style);
                } catch (e) {
                    if (styleSheet.href) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = styleSheet.href;
                        w.document.head.appendChild(link);
                    }
                }
            });

            setPipWindow(w);
            w.addEventListener('pagehide', () => setPipWindow(null));
        } catch (err) {
            console.error('[PiP Error]', err);
        }
    };

    // Auto-trigger PiP when sharing
    useEffect(() => {
        if (isSharing && !pipWindow) {
            const timer = setTimeout(() => {
                toggleMeetingPiP();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [isSharing]);

    const initAudioPipeline = () => {
        if (audioContext.current) return { ctx: audioContext.current, destination: recDestination.current };
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const destination = ctx.createMediaStreamDestination();
        audioContext.current = ctx;
        recDestination.current = destination;
        connectedNodes.current = {};

        // Local Audio
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                const src = ctx.createMediaStreamSource(new MediaStream([track]));
                src.connect(destination);
                connectedNodes.current['me'] = src;
            }
        }

        // Remote Audio
        (sfuPeers || []).forEach(p => {
            if (p.stream) {
                const track = p.stream.getAudioTracks()[0];
                if (track) {
                    const src = ctx.createMediaStreamSource(new MediaStream([track]));
                    src.connect(destination);
                    connectedNodes.current[p.id] = src;
                }
            }
        });

        return { ctx, destination };
    };


    const startRecording = async () => {
        if (!isHost) return;
        try {
            const { destination } = initAudioPipeline();
            recChunks.current = [];
            mediaRecorder.current = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
            mediaRecorder.current.ondataavailable = (e) => { if (e.data.size > 0) recChunks.current.push(e.data); };
            mediaRecorder.current.start(1000);
            setIsRecording(true);
            setRecSeconds(0);
            recTimer.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
        } catch (e) { }
    };

    const startScreenRecording = async () => {
        if (!isHost) return;
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            screenRecChunks.current = [];
            screenMediaRecorder.current = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            screenMediaRecorder.current.ondataavailable = (e) => { if (e.data.size > 0) screenRecChunks.current.push(e.data); };
            screenMediaRecorder.current.onstop = async () => {
                const blob = new Blob(screenRecChunks.current, { type: 'video/webm' });
                await uploadScreenRecording(blob);
                stream.getTracks().forEach(t => t.stop());
            };
            screenMediaRecorder.current.start(1000);
            setIsScreenRecording(true);
            setScreenRecSeconds(0);
            screenRecTimer.current = setInterval(() => setScreenRecSeconds(s => s + 1), 1000);
        } catch (e) { }
    };

    const stopScreenRecording = () => {
        if (screenMediaRecorder.current && screenMediaRecorder.current.state !== 'inactive') {
            screenMediaRecorder.current.stop();
        }
        setIsScreenRecording(false);
        clearInterval(screenRecTimer.current);
    };

    const uploadScreenRecording = async (blob) => {
        setScreenUploading(true);
        try {
            const token = await getToken();
            const form = new FormData();
            form.append('file', blob, `screen_${normalizedRoomId}.webm`);
            form.append('roomId', normalizedRoomId);
            await fetch(`${import.meta.env.VITE_API_URL}/recordings/screen-upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        } catch (e) { } finally { setScreenUploading(false); }
    };

    const stopRecording = () => {
        if (!isRecording) return Promise.resolve();
        return new Promise(resolve => {
            clearInterval(recTimer.current);
            setIsRecording(false);
            if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
                mediaRecorder.current.onstop = async () => {
                    const blob = new Blob(recChunks.current, { type: 'audio/webm' });
                    await uploadRecording(blob);
                    resolve();
                };
                mediaRecorder.current.stop();
            } else resolve();
        });
    };

    const uploadRecording = async (blob) => {
        setUploading(true); setBotPhase('starting'); setPhaseMsg('Uploading...');
        try {
            const token = await getToken();
            const form = new FormData();
            form.append('file', blob, `rec_${normalizedRoomId}.webm`);
            form.append('roomId', normalizedRoomId);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/recordings/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
            const data = await res.json();
            if (data.url) triggerAI(data.url);
        } catch (e) { setBotPhase('error'); } finally { setUploading(false); }
    };

    const triggerAI = async (url) => {
        setBotPhase('fetching'); setPhaseMsg('AI is processing...');
        try {
            const token = await getToken();
            await fetch(`${import.meta.env.VITE_API_URL}/vexa/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ meetingId: normalizedRoomId, recordingUrl: url })
            });
        } catch (e) { setBotPhase('error'); }
    };


    useEffect(() => {
        if (sfuLocalStream) {
            localStreamRef.current = sfuLocalStream;
            setLocalStream(sfuLocalStream);
            // No longer need to manually toggle tracks here as useMediasoup handles it now
        }
    }, [sfuLocalStream]);

    useEffect(() => {
        if (!normalizedRoomId || !user) return;

        // Broadcast profile once socket is ready
        if (sfuSocket?.current?.connected) {
            broadcastProfile();
        }

        const pulseTimer = setInterval(async () => {
            const token = await getToken();
            if (token) {
                fetch(`${import.meta.env.VITE_API_URL}/meetings/pulse/${normalizedRoomId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
                }).catch(() => { });
            }
        }, 45000);
        return () => clearInterval(pulseTimer);
    }, [normalizedRoomId, getToken, user]);

    if (isEnded) {
        return (
            <MeetingEnded
                title={meetingTitle}
                onHome={onLeave}
                onNew={() => window.location.href = '/dashboard?new=true'}
            />
        );
    }

    return (

        <div className="h-screen flex flex-col overflow-hidden bg-[#fdfdfd] text-gray-900 font-sans">
            {isPending && (
                <div className="fixed inset-0 z-[5000] bg-white flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                        <Users className="text-orange-600" size={40} />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 mb-2">Waiting for Host...</h2>
                    <p className="text-gray-500 max-w-md mx-auto mb-8">
                        The meeting host has been notified of your request to join. Please stay on this screen.
                    </p>
                    <div className="flex gap-4">
                        <button onClick={handleLeave} className="px-8 py-3 bg-gray-100 text-gray-700 font-bold rounded-2xl">Leave</button>
                    </div>
                </div>
            )}

            <MeetingHeader
                isRecording={isRecording}
                recSeconds={recSeconds}
                isScreenRecording={isScreenRecording}
                screenRecSeconds={screenRecSeconds}
                uploading={uploading || screenUploading}
                setShowInvite={setShowInvite}
                participantCount={remoteUsers.length + 1}
                waitingCount={waitingRoom.length}
                setShowParticipants={setShowParticipants}
                isHost={isHost}
                handleLeave={confirmLeaveMeeting}
                onEnd={handleEndMeeting}
                title={meetingTitle}
                updateTitle={meetingTitle}
                roomId={roomId}
            />


            {/* ... rest of the main content ... */}
            <main className="flex-1 min-h-0 relative flex flex-col bg-[#fdfdfd] overflow-hidden">
                {showStage ? (
                    <div className="flex-1 h-full flex flex-col min-h-0">
                        {/* THE STAGE: TOP SECTION (Screen Share OR Whiteboard) */}
                        <div className="flex-1 bg-gray-50 relative min-h-0">
                            <div className={cn("absolute inset-0 z-10", !showWhiteboard && "hidden")}>
                                <Whiteboard
                                    roomId={normalizedRoomId}
                                    isHost={isHost}
                                    onClose={() => setShowWhiteboard(false)}
                                    onDraw={sfuSendWhiteboardDraw}
                                    onClear={sfuSendWhiteboardClear}
                                    drawData={whiteboardDrawData}
                                />

                            </div>
                            {!showWhiteboard && (
                                <>
                                    <ScreenSharePlayer stream={screenFeed} />
                                    <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-lg text-white text-[10px] font-bold uppercase tracking-wider z-20">
                                        <ScreenShare size={14} /> {isSharing ? 'Sharing Screen' : `${sharingRemoteUser?.userName || 'Participant'} is presenting`}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Participants: BOTTOM STRIP */}
                        <div className="h-24 sm:h-32 lg:h-40 bg-white flex items-center gap-3 overflow-x-auto px-4 py-2 border-t border-gray-100 scrollbar-none">
                            <div className="aspect-video h-full shrink-0">
                                <UserTile isYou user={myData} peerState={{ muted: !micOn, handRaised, adminMuted }} activeSpeaker={activeSpeaker === 'me'} small />
                            </div>
                            {visibleStripUsers.map((u, idx) => (
                                <div key={u.id || idx} className="aspect-video h-full shrink-0">
                                    <UserTile 
                                        user={u} 
                                        peerState={peerStates[u.id]} 
                                        activeSpeaker={activeSpeaker === u.id} 
                                        isHost={isHost} 
                                        onForceMute={() => sendAdminMute(u.id)}
                                        onForceUnmute={() => sendAdminUnmute(u.id)}
                                        small 
                                    />
                                </div>
                            ))}
                            {deduplicatedRemoteUsers.length > visibleStripUsers.length && (
                                <div className="h-[80%] aspect-square flex items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-gray-400 font-bold text-xs shrink-0">
                                    +{deduplicatedRemoteUsers.length - visibleStripUsers.length}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 p-4 lg:p-8 flex flex-col items-center justify-center overflow-hidden">
                        {remoteUsers.length === 0 ? (
                            /* ── SINGLE USER HERO VIEW ── */
                            <div className="w-full max-w-5xl h-full max-h-[85%] relative aspect-video rounded-3xl overflow-hidden bg-gray-50 border border-gray-200 shadow-xl animate-in fade-in zoom-in duration-700">
                                <UserTile isYou user={myData} peerState={{ muted: !micOn, handRaised, adminMuted }} activeSpeaker={activeSpeaker === 'me'} />
                            </div>
                        ) : (
                            /* ── MULTI-USER GRID ── */
                            <div
                                className="w-full h-full grid gap-3 sm:gap-4 lg:gap-6 place-items-center overflow-y-auto scrollbar-none p-2 sm:p-4"
                                style={{
                                    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`,
                                    alignContent: 'center'
                                }}
                            >
                                <div className="relative aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-gray-50 border border-gray-200 shadow-md">
                                    <UserTile isYou user={myData} peerState={{ muted: !micOn, handRaised, adminMuted }} activeSpeaker={activeSpeaker === 'me'} />
                                </div>
                                {visibleGridUsers.map(u => (
                                    <div key={u.id} className="relative aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-gray-50 border border-gray-200 shadow-md">
                                        <UserTile 
                                            user={u} 
                                            peerState={peerStates[u.id]} 
                                            activeSpeaker={activeSpeaker === u.id} 
                                            isHost={isHost} 
                                            onForceMute={() => sendAdminMute(u.id)}
                                            onForceUnmute={() => sendAdminUnmute(u.id)}
                                        />
                                    </div>
                                ))}
                                {deduplicatedRemoteUsers.length > visibleGridUsers.length && (
                                    <div className="col-span-full py-4 text-center">
                                        <button
                                            onClick={() => setShowParticipants(true)}
                                            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-xs font-bold transition-all"
                                        >
                                            View all {deduplicatedRemoteUsers.length + 1} participants
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
                <BotHUD botPhase={botPhase} phaseMsg={phaseMsg} countdown={countdown} />
                {endMessage && <div className="absolute inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 text-center text-white"><h2 className="text-3xl font-black">{endMessage}</h2></div>}

                {/* --- FLOATING REACTIONS --- */}
                {reactions.map(r => (
                    <FloatingReaction key={r.id} reactionKey={r.key} name={r.name} onDone={() => setReactions(prev => prev.filter(x => x.id !== r.id))} />
                ))}
            </main>

            <MeetingFooter
                micOn={micOn} toggleMic={toggleMic} videoOn={videoOn} toggleVideo={toggleVideo}
                isSharing={isSharing} toggleShare={toggleShare} handRaised={handRaised} toggleHand={toggleHand}
                isRecording={isRecording} startRecording={startRecording} stopRecording={stopRecording}
                isScreenRecording={isScreenRecording}
                startScreenRecording={startScreenRecording}
                stopScreenRecording={stopScreenRecording}
                screenRecSeconds={screenRecSeconds}
                screenUploading={screenUploading}
                anyoneSharing={anyoneSharing}
                setShowReacts={setShowReacts}
                onWhiteboard={() => setShowWhiteboard(!showWhiteboard)}
                showWhiteboard={showWhiteboard}
                panel={panel} setPanel={setPanel}
                messages={messages} unread={unread} setUnread={setUnread} handleLeave={confirmLeaveMeeting} isHost={isHost}
                onEnd={confirmEndMeeting} hasAiSummary={!!summary} showTranscript={showTranscript} setShowTranscript={setShowTranscript}
                onPiP={toggleMeetingPiP} pipActive={!!pipWindow}
                onEffects={() => setPanel(panel === 'effects' ? null : 'effects')}
                effectsActive={panel === 'effects'}
            />

            <AnimatePresence>
                {panel === 'chat' && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] bg-white border-l shadow-2xl flex flex-col">
                        <ChatPanel
                            messages={messages}
                            onSend={sendMsg}
                            onClose={() => setPanel(null)}
                            participants={deduplicatedRemoteUsers}
                            onCreatePoll={(pData) => sfuSocket.current?.emit('create-poll', pData)}
                            onVotePoll={(vData) => sfuSocket.current?.emit('vote-poll', vData)}
                        />

                    </motion.div>
                )}
                {panel === 'notes' && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] bg-white border-l shadow-2xl flex flex-col">
                        <NotesPanel
                            notes={personalNotes}
                            setNotes={setPersonalNotes}
                            isSaving={isSavingNotes}
                            onClose={() => setPanel(null)}
                        />
                    </motion.div>
                )}
                {panel === 'effects' && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] bg-white border-l shadow-2xl flex flex-col">
                        <VideoEffects
                            activeFilter={activeFilter}
                            onSelect={async (fid) => {
                                setActiveFilter(fid);
                                try {
                                    const style = EFFECT_STYLES.find(s => s.id === fid)?.style;
                                    const filterItem = EFFECT_STYLES.find(s => s.id === fid);
                                    if (localStream && videoOn) {
                                        // 1. Clean up potential old tracks/managers to prevent leaks
                                        if (processedStreamRef.current) {
                                            processedStreamRef.current.getTracks().forEach(t => t.stop());
                                        }

                                        const originalStream = await navigator.mediaDevices.getUserMedia({ 
                                            video: { width: 1280, height: 720, frameRate: 24 } 
                                        });
                                        const processedStream = await applyFilterToStream(originalStream, style || 'none');
                                        
                                        const videoTrack = processedStream.getVideoTracks()[0];
                                        if (videoTrack) {
                                            await replaceVideoTrack(videoTrack);
                                            setLocalStream(processedStream);
                                            processedStreamRef.current = processedStream;
                                            
                                            mediaManager.registerStream(originalStream);
                                            mediaManager.registerStream(processedStream);
                                            
                                            setActiveFilter(fid);
                                            
                                            // PREMIUM TOAST STYLE
                                            toast.dismiss();
                                            toast.custom((t) => (
                                                <div className="bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-4 flex flex-col gap-3 min-w-[280px] animate-in slide-in-from-right-2 duration-300">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                                                            <Palette size={20} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-extrabold text-gray-900 text-[13px] uppercase tracking-tight">Effect Applied</span>
                                                            <span className="text-[11px] text-gray-400 font-bold">{filterItem?.label || 'New Filter'} active</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ), { duration: 2500, position: 'bottom-right' });
                                        }
                                    }
                                } catch (error) {
                                    console.error('[FILTER ERROR]', error);
                                    toast.error('Failed to Apply Effect');
                                }
                            }}
                            onClose={() => setPanel(null)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showParticipants && (
                    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] bg-white border-l shadow-2xl">
                        <ParticipantsPanel
                            participants={[myData, ...deduplicatedRemoteUsers]}
                            waitingRoom={waitingRoom}
                            onApprove={approveParticipant}
                            onReject={rejectParticipant}
                            onAdminMute={sendAdminMute}
                            onClose={() => setShowParticipants(false)}
                            isHost={isHost}
                            peerStates={peerStates}
                            myId={myData.id}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>{showInvite && <InviteModal roomId={normalizedRoomId} onClose={() => setShowInvite(false)} />}</AnimatePresence>
            <AnimatePresence>
                {showReacts && (
                    <SelectionModal
                        options={REACTIONS}
                        onSelect={sendReact}
                        onClose={() => setShowReacts(false)}
                    />
                )}
            </AnimatePresence>

            {pipWindow && createPortal(
                <div className="flex flex-col h-full bg-gray-950 p-2 gap-2 overflow-y-auto overflow-x-hidden border-none shadow-none scrollbar-hide">
                    <div className="flex flex-col gap-0.5 mb-1 px-1">
                        <span className="text-[8px] font-black tracking-widest text-premium-accent uppercase opacity-60">Active Session</span>
                        <h2 className="text-white text-[10px] font-bold leading-tight truncate">{meetingTitle}</h2>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="w-full aspect-video rounded-xl bg-gray-900/50 overflow-hidden relative border border-white/5 shadow-2xl transition-all duration-500 hover:scale-[1.02]">
                            <UserTile
                                user={{ 
                                    ...myData,
                                    videoStream: localStream ? new MediaStream(localStream.getVideoTracks()) : null,
                                    audioStream: localStream ? new MediaStream(localStream.getAudioTracks()) : null
                                }}
                                isYou={true}
                                small
                                activeSpeaker={activeSpeaker === 'me'}
                            />
                        </div>
                        {remoteUsers.slice(0, 4).map(u => (
                            <div key={u.id} className="w-full aspect-video rounded-xl bg-gray-900/50 overflow-hidden relative border border-white/5 shadow-2xl transition-all duration-500 hover:scale-[1.02]">
                                <UserTile
                                    user={u}
                                    peerState={peerStates[u.id]}
                                    small
                                    activeSpeaker={String(activeSpeaker) === String(u.id)}
                                    isHost={isHost}
                                />
                            </div>
                        ))}
                    </div>
                    {remoteUsers.length > 4 && (
                        <div className="text-[8px] text-gray-600 font-black text-center py-2 uppercase tracking-widest opacity-40">
                            +{remoteUsers.length - 4} Participants
                        </div>
                    )}
                </div>,
                pipWindow.document.body
            )}
        </div>
    );
};

export default MeetingRoom;
