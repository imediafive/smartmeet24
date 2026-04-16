import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export const useWebRTC = (roomId, user, onRemoteStream, onUserLeft, onMessage, onStateUpdate) => {
    const [peers, setPeers] = useState([]);
    const socket = useRef(null);
    const localStream = useRef(null);
    const peersRef = useRef([]); // { peerId, peer, userId, userName }

    const createPeer = (userToSignal, callerId, stream) => {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socket.current.emit('signal', {
                to: userToSignal,
                from: callerId,
                signal,
                fromName: user?.name,
                fromAvatar: user?.avatar
            });
        });

        return peer;
    };

    const addPeer = (incomingSignal, callerId, stream) => {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socket.current.emit('signal', { signal, to: callerId });
        });

        peer.signal(incomingSignal);

        return peer;
    };

    useEffect(() => {
        socket.current = io(SOCKET_URL);

        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            localStream.current = stream;
            // Notify UI of local stream if needed, but usually handled in the component
            
            socket.current.emit('join-room', {
                roomId,
                userId: user?.id || user?._id,
                userName: user?.name,
                userAvatar: user?.avatar
            });

            socket.current.on('user-joined', ({ userId, userName, userAvatar, socketId }) => {
                console.log('User joined:', userName);
                const peer = createPeer(socketId, socket.current.id, stream);
                peersRef.current.push({
                    peerId: socketId,
                    peer,
                    userId,
                    userName,
                });
                
                setPeers(prev => [...prev, { peerId: socketId, userId, userName, userAvatar }]);

                peer.on('stream', stream => {
                    onRemoteStream(socketId, stream, { userId, userName, userAvatar });
                });
            });

            socket.current.on('signal', ({ signal, from, userId: fromUserId, userName: fromUserName, fromAvatar }) => {
                const item = peersRef.current.find(p => p.peerId === from);
                if (item) {
                    item.peer.signal(signal);
                } else {
                    const peer = addPeer(signal, from, stream);
                    peersRef.current.push({
                        peerId: from,
                        peer,
                        userId: fromUserId,
                        userName: fromUserName,
                    });
                    
                    setPeers(prev => [...prev, { peerId: from, userId: fromUserId, userName: fromUserName, userAvatar: fromAvatar }]);

                    peer.on('stream', stream => {
                        onRemoteStream(from, stream, { userId: fromUserId, userName: fromUserName, userAvatar: fromAvatar });
                    });
                }
            });

            socket.current.on('user-left', ({ socketId }) => {
                const peerObj = peersRef.current.find(p => p.peerId === socketId);
                if (peerObj) peerObj.peer.destroy();
                peersRef.current = peersRef.current.filter(p => p.peerId !== socketId);
                setPeers(prev => prev.filter(p => p.peerId !== socketId));
                onUserLeft(socketId);
            });

            socket.current.on('chat-message', onMessage);
            socket.current.on('state', onStateUpdate);
        });

        return () => {
            socket.current.disconnect();
            if (localStream.current) {
                localStream.current.getTracks().forEach(track => track.stop());
            }
            peersRef.current.forEach(p => p.peer.destroy());
        };
    }, [roomId, user?.id, user?._id, user?.name, user?.avatar]);

    const sendMessage = (msg) => {
        socket.current.emit('chat-message', msg);
    };

    const updateState = (state) => {
        socket.current.emit('state-update', { state });
    };

    return { peers, localStream: localStream.current, sendMessage, updateState };
};
