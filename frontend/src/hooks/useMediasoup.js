import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export const useMediasoup = (roomId, user, options = {}, initialConfig = {}) => {
    const callbacksRef = useRef(options);
    useEffect(() => { callbacksRef.current = options; }, [options]);

    const socket = useRef(null);
    const device = useRef(null);
    const sendTransport = useRef(null);
    const recvTransport = useRef(null);
    const producers = useRef(new Map()); 
    const consumers = useRef(new Map()); 
    const sfuInitialized = useRef(false);
    
    const [peers, setPeers] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [isPending, setIsPending] = useState(false);

    const connectSocket = useCallback(() => {
        if (socket.current?.connected) return;

        socket.current = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5
        });

        const doJoin = async () => {
            if (!socket.current) return;
            socket.current.emit('join-room', {
                roomId,
                userId: user?.id || user?._id,
                userName: user?.name,
                userAvatar: user?.avatar
            }, async (response) => {
                if (response?.status === 'pending') {
                    console.log('[SFU] Waiting room entry confirmed');
                    setIsPending(true);
                    if (callbacksRef.current.onWaitingRoomUpdate && response.meeting?.waitingRoom) {
                        callbacksRef.current.onWaitingRoomUpdate(response.meeting.waitingRoom);
                    }
                } else if (response?.status === 'active') {
                    console.log('[SFU] Joined active meeting');
                    setIsPending(false);
                    if (response.isHost && callbacksRef.current.onHostStatus) {
                        callbacksRef.current.onHostStatus(true);
                    }
                    if (callbacksRef.current.onWaitingRoomUpdate && response.meeting?.waitingRoom) {
                        callbacksRef.current.onWaitingRoomUpdate(response.meeting.waitingRoom);
                    }
                    await initMediasoup();
                } else {
                    console.error('[SFU JOIN ERROR]', response?.error);
                    if (callbacksRef.current.onJoinError) {
                        callbacksRef.current.onJoinError(response?.error);
                    }
                }
            });
        };

        socket.current.on('connect', async () => {
            console.log('[SFU] Connected to signaling');
            await doJoin();
        });

        socket.current.on('participant-approved', async ({ userId: approvedId }) => {
            const myId = String(user?.id || user?._id);
            if (String(approvedId) === myId) {
                console.log('[SFU] Approved by host. Transitioning to active room...');
                await doJoin(); // Re-emit join-room to join the socket.io room and start SFU
            }
        });


        socket.current.on('new-producer', async ({ producerId, userId: pUserId, userName: pUserName, userAvatar: pAvatar, kind, type }) => {
            console.log('[SFU] New producer in room:', pUserId, kind, type);
            await consumeProducer(producerId, pUserId, pUserName, pAvatar, type);
        });

        socket.current.on('user-joined', (d) => {
            console.log('[SFU] User joined (initial):', d.userId);
            if (callbacksRef.current.onUserJoined) callbacksRef.current.onUserJoined(d);
        });

        socket.current.on('profile-update', (d) => {
            console.log('[SFU] Profile updated:', d.userId);
            if (callbacksRef.current.onProfileUpdate) callbacksRef.current.onProfileUpdate(d);
        });

        socket.current.on('user-left', ({ socketId, userId: leftUserId }) => {
            setPeers(prev => prev.filter(p => p.socketId !== socketId));
            if (callbacksRef.current.onUserLeft) callbacksRef.current.onUserLeft(socketId);
        });

        socket.current.on('chat-message', (d) => callbacksRef.current.onMessage?.(d));
        socket.current.on('reaction', (d) => callbacksRef.current.onReaction?.(d));
        socket.current.on('whiteboard-draw', (d) => callbacksRef.current.onWhiteboardDraw?.(d));
        socket.current.on('whiteboard-clear', (d) => callbacksRef.current.onWhiteboardClear?.(d));
        socket.current.on('whiteboard-toggle', (d) => callbacksRef.current.onWhiteboardToggle?.(d));
        socket.current.on('ai-update', (d) => callbacksRef.current.onAiUpdate?.(d));
        socket.current.on('new-poll', (d) => callbacksRef.current.onNewPoll?.(d));
        socket.current.on('poll-vote', (d) => callbacksRef.current.onPollVote?.(d));
        socket.current.on('poll-closed', (d) => callbacksRef.current.onPollClosed?.(d));
        socket.current.on('history-sync', (d) => callbacksRef.current.onHistorySync?.(d));
        socket.current.on('state-update', (d) => callbacksRef.current.onStateUpdate?.(d));
        socket.current.on('waiting-room-update', (d) => {
            if (callbacksRef.current.onWaitingRoomUpdate) callbacksRef.current.onWaitingRoomUpdate(d.waitingRoom);
        });
        socket.current.on('producer-closed', ({ producerId, userId: pUserId }) => {
            console.log('[SFU] Producer closed:', producerId);
            // We can optionally clear tracks here if needed, but usually individual track management 
            // is handled by the consumer's onClose event in the browser.
            // For UI simplicity, we just notify the component.
            if (callbacksRef.current.onProducerClosed) callbacksRef.current.onProducerClosed(producerId, pUserId);
        });

        socket.current.on('admin-mute', (d) => {
            console.log('[SFU] Admin muted you');
            if (callbacksRef.current.onAdminMute) callbacksRef.current.onAdminMute(d);
        });
        socket.current.on('admin-unmute', (d) => {
            console.log('[SFU] Admin unmuted you');
            if (callbacksRef.current.onAdminUnmute) callbacksRef.current.onAdminUnmute(d);
        });

        socket.current.on('meeting-ended', () => {
            if (callbacksRef.current.onMeetingEnded) callbacksRef.current.onMeetingEnded();
        });
    }, [roomId, user?.id, user?._id]);

    const sendAdminMute = useCallback((targetUserId) => {
        socket.current.emit('admin-mute', { targetUserId });
    }, []);
    const sendAdminUnmute = useCallback((targetUserId) => {
        socket.current.emit('admin-unmute', { targetUserId });
    }, []);





    const initMediasoup = async () => {
        if (sfuInitialized.current) return;
        try {
            const rtpCapabilities = await new Promise(resolve => 
                socket.current.emit('get-router-rtp-capabilities', {}, resolve)
            );
            device.current = new mediasoupClient.Device();
            await device.current.load({ routerRtpCapabilities: rtpCapabilities });
            await createSendTransport();
            await createRecvTransport();
            await produceMedia();
            sfuInitialized.current = true;
 
            // Fetch and consume existing producers + their states
            const response = await new Promise(resolve =>
                socket.current.emit('get-producers', {}, resolve)
            );
            const { producers: producerList, userStates, participants } = response || { producers: [], userStates: {}, participants: [] };
            
            // Initial state sync for existing users
            if (callbacksRef.current.onInitialStateSync) {
                callbacksRef.current.onInitialStateSync(userStates);
            }

            // Sync all participant data
            participants.forEach(p => {
                const myId = String(user?.id || user?._id);
                if (String(p.userId) !== myId && callbacksRef.current.onUserJoined) {
                    callbacksRef.current.onUserJoined({ 
                        userId: p.userId, 
                        userName: p.userName, 
                        userAvatar: p.userAvatar,
                        socketId: p.socketId
                    });
                }
            });

            for (const p of producerList) {
                if (String(p.userId) !== String(user?.id)) {
                    await consumeProducer(p.producerId, p.userId, p.userName, p.userAvatar, p.type);
                }
            }
        } catch (err) {
            console.error('[SFU INIT ERROR]', err);
        }
    };

    const createSendTransport = async () => {
        const transportParams = await new Promise(resolve => 
            socket.current.emit('create-transport', {}, resolve)
        );

        sendTransport.current = device.current.createSendTransport({
            ...transportParams,
            iceServers: [
                {
                    urls: [
                        'turn:smartmeet24.com:3478',
                        'turn:smartmeet24.com:53?transport=udp',
                        'turn:smartmeet24.com:443?transport=udp',
                        'turn:smartmeet24.com:3478?transport=tcp',
                        'turn:smartmeet24.com:53?transport=tcp'
                    ],
                    username: 'smartmeet',
                    credential: 'supersecretturn2026'
                }
            ]
        });

        sendTransport.current.on('connect', ({ dtlsParameters }, callback, errback) => {
            socket.current.emit('connect-transport', { 
                transportId: sendTransport.current.id, 
                dtlsParameters 
            }, () => callback());
        });

        sendTransport.current.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
            socket.current.emit('produce', {
                transportId: sendTransport.current.id,
                kind,
                rtpParameters,
                appData
            }, ({ id }) => callback({ id }));
        });
    };

    const createRecvTransport = async () => {
        const transportParams = await new Promise(resolve => 
            socket.current.emit('create-transport', {}, resolve)
        );

        recvTransport.current = device.current.createRecvTransport({
            ...transportParams,
            iceServers: [
                {
                    urls: [
                        'turn:smartmeet24.com:3478',
                        'turn:smartmeet24.com:53?transport=udp',
                        'turn:smartmeet24.com:443?transport=udp',
                        'turn:smartmeet24.com:3478?transport=tcp',
                        'turn:smartmeet24.com:53?transport=tcp'
                    ],
                    username: 'smartmeet',
                    credential: 'supersecretturn2026'
                }
            ]
        });

        recvTransport.current.on('connect', ({ dtlsParameters }, callback, errback) => {
            socket.current.emit('connect-transport', {
                transportId: recvTransport.current.id,
                dtlsParameters
            }, () => callback());
        });
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const track = stream.getVideoTracks()[0];
            if (!track) return;

            const producer = await sendTransport.current.produce({ track, appData: { type: 'camera' } });
            producers.current.set('video', producer);

            setLocalStream(prev => {
                if (!prev) return stream;
                const newStream = new MediaStream(prev.getTracks().filter(t => t.kind !== 'video'));
                newStream.addTrack(track);
                return newStream;
            });

            producer.on('transportclose', () => {
                console.log('[SFU] Camera producer transport closed');
                producers.current.delete('video');
            });

            return track;
        } catch (err) {
            console.error('[SFU START CAMERA ERROR]', err);
        }
    };

    const replaceVideoTrack = async (newTrack) => {
        const producer = producers.current.get('video');
        if (producer && newTrack) {
            await producer.replaceTrack({ track: newTrack });
        }
    };

    const stopCamera = async () => {
        const producer = producers.current.get('video');
        if (producer) {
            producer.close();
            producers.current.delete('video');
            socket.current.emit('producer-closed', { producerId: producer.id });
            
            if (localStream) {
                localStream.getVideoTracks().forEach(t => {
                    t.stop();
                    localStream.removeTrack(t);
                });
            }
        }
    };

    const startMic = async () => {
        try {
            // Cleanup existing first
            const oldProducer = producers.current.get('audio');
            if (oldProducer) {
                oldProducer.close();
                producers.current.delete('audio');
            }
            if (localStream) {
                localStream.getAudioTracks().forEach(t => t.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            const track = stream.getAudioTracks()[0];
            if (!track) return;

            const producer = await sendTransport.current.produce({ track, appData: { type: 'mic' } });
            producers.current.set('audio', producer);

            setLocalStream(prev => {
                const base = prev || new MediaStream();
                base.getAudioTracks().forEach(t => { t.stop(); base.removeTrack(t); });
                base.addTrack(track);
                return new MediaStream(base.getTracks()); 
            });

            producer.on('transportclose', () => {
                console.log('[SFU] Mic producer transport closed');
                producers.current.delete('audio');
            });

            return track;
        } catch (err) {
            console.error('[SFU START MIC ERROR]', err);
        }
    };

    const stopMic = async () => {
        const producer = producers.current.get('audio');
        if (producer) {
            producer.close();
            producers.current.delete('audio');
            socket.current.emit('producer-closed', { producerId: producer.id });

            if (localStream) {
                localStream.getAudioTracks().forEach(t => {
                    t.stop();
                    localStream.removeTrack(t);
                });
            }
        }
    };

    const produceMedia = async () => {
        // Only start if explicitly requested or default to both
        if (initialConfig.micOn !== false) await startMic();
        if (initialConfig.videoOn !== false) await startCamera();
    };

    const shareScreen = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const track = stream.getVideoTracks()[0];
            const producer = await sendTransport.current.produce({ track, appData: { type: 'screen' } });
            producers.current.set('screen', producer);
            
            track.onended = () => {
                stopShareScreen();
                if (callbacksRef.current.onScreenShareEnded) {
                    callbacksRef.current.onScreenShareEnded();
                }
            };
            return stream;
        } catch (err) {
            console.error('[SFU SCREEN SHARE ERROR]', err);
        }
    };

    const stopShareScreen = async () => {
        const producer = producers.current.get('screen');
        if (producer) {
            producer.close();
            producers.current.delete('screen');
            socket.current.emit('producer-closed', { producerId: producer.id });
        }
    };


    const consumeProducer = async (producerId, userId, userName, userAvatar, type) => {
        const { rtpCapabilities } = device.current;
        
        socket.current.emit('consume', {
            transportId: recvTransport.current.id,
            producerId,
            rtpCapabilities
        }, async (params) => {
            if (params.error) return console.error('Consume error', params.error);

            const consumer = await recvTransport.current.consume(params);
            consumers.current.set(consumer.id, consumer);
            
            // Critical Fix: Explicitly resume on both ends to guarantee data flow
            socket.current.emit('resume-consumer', { consumerId: consumer.id });
            await consumer.resume();

            const stream = new MediaStream([consumer.track]);
            
            const resolvedType = params.type || type || 'camera';

            if (callbacksRef.current.onRemoteStream) {
                callbacksRef.current.onRemoteStream(producerId, stream, { userId, userName, userAvatar, type: resolvedType });
            }
            
            setPeers(prev => {
                if (prev.some(p => p.userId === userId)) return prev;
                if (params.isHost) socket.current.isHost = true;
                return [...prev, { userId, userName, userAvatar, socketId: producerId }];
            });
        });
    };

    const localStreamRef = useRef(null);

    useEffect(() => {
        localStreamRef.current = localStream;
    }, [localStream]);

    useEffect(() => {
        connectSocket();
        return () => {
            console.log('[SFU] Cleaning up Mediasoup hook');
            socket.current?.disconnect();
            sendTransport.current?.close();
            recvTransport.current?.close();
            
            // Critical Fix: Stop all local media tracks so the camera light turns off
            if (localStreamRef.current) {
                console.log('[SFU] Closing all media tracks');
                localStreamRef.current.getTracks().forEach(track => {
                    track.stop();
                    console.log(`[SFU] Stopped track: ${track.kind}`);
                });
            }
        };
    }, [connectSocket]);

    const sendMessage = useCallback((msg) => socket.current.emit('chat-message', msg), []);
    const updateState = useCallback((state) => socket.current.emit('state-update', { state }), []);
    const sendReaction = useCallback((key) => socket.current.emit('reaction', { key }), []);
    const sendWhiteboardDraw = useCallback((data) => socket.current.emit('whiteboard-draw', data), []);
    const sendWhiteboardClear = useCallback((data) => socket.current.emit('whiteboard-clear', data), []);
    const sendWhiteboardToggle = useCallback((visible) => socket.current.emit('whiteboard-toggle', { visible }), []);
    const sendPoll = useCallback((poll) => socket.current.emit('create-poll', poll), []);
    const votePoll = useCallback((payload) => socket.current.emit('vote-poll', payload), []);

    return useMemo(() => ({ 
        peers, localStream, isPending, sendMessage, updateState, shareScreen, stopShareScreen,
        startCamera, stopCamera, startMic, stopMic,
        sendReaction, sendWhiteboardDraw, sendWhiteboardClear, sendWhiteboardToggle,
        sendAdminMute, sendAdminUnmute, sendPoll, votePoll, replaceVideoTrack,
        socket 
    }), [peers, localStream, isPending, sendMessage, updateState, shareScreen, stopShareScreen,
         startCamera, stopCamera, startMic, stopMic,
         sendReaction, sendWhiteboardDraw, sendWhiteboardClear, sendWhiteboardToggle,
         sendAdminMute, sendAdminUnmute, sendPoll, votePoll, replaceVideoTrack]);

};


