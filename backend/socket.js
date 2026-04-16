import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { getOrCreateRoom, createWebRtcTransport } from './mediasoup.js';
import { bpManager } from './backpressure.js';
import { broadcastToCluster } from './clusterBus.js';
import Meeting from './models/Meeting.js';
import User from './models/User.js';
import { createOrJoinMeeting } from './controllers/meetingController.js';
let io = null;
export const getIO = () => io;

export const initSocket = (server, instanceId) => {
    io = new Server(server, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        },
        transports: ['websocket', 'polling'] // Professional fallback
    });

    io.on('connection', (socket) => {
        socket.transports = new Set(); // Track transports for cleanup

        // Every event is wrapped in Backpressure Enqueue
        const safeOn = (event, handler) => {
            socket.on(event, async (...args) => {
                try {
                    await bpManager.enqueue(async () => {
                        try {
                            const result = await handler(...args);
                            const lastArg = args[args.length - 1];
                            if (typeof lastArg === 'function') {
                                lastArg(result || { status: 'ok' });
                            }
                        } catch (err) {
                            const isExpected = ['Meeting has already ended', 'Waiting room', 'User not allowed'].some(msg => err.message?.includes(msg));
                            if (isExpected) {
                                console.warn(`[SOCKET INFO] Event: ${event} - ${err.message}`);
                            } else {
                                console.error(`[SOCKET HANDLER ERROR] Event: ${event}`, err);
                            }
                            
                            const callback = args[args.length - 1];
                            if (typeof callback === 'function') {
                                callback({ error: err.message || 'Internal Server Error' });
                            }
                        }
                    }, socket);
                } catch (enqueueErr) {
                    console.error(`[SOCKET ENQUEUE ERROR]`, enqueueErr);
                }
            });
        };


        safeOn('join-room', async (data, callback) => {
            const { roomId, userId, userName, userAvatar } = data;
            const normalizedRoom = (roomId || '').toLowerCase().trim();
            if (!normalizedRoom) return;

            // Ensure remote anonymous or guest users don't share an `undefined` userId
            const finalUserId = userId || `guest_${socket.id}`;

            try {
                // Important: Set these even if pending, so SFU calls work after approval
                socket.roomId = normalizedRoom;
                socket.userId = finalUserId;
                socket.userAvatar = userAvatar;

                // Robust name fetching with whitespace sanitization
                let finalName = (userName || '').trim();
                if (!finalName || finalName === 'Guest' || finalName === 'User' || finalName === 'Connecting...' || finalName.length < 1) {
                    try {
                        const dbUser = await User.findById(userId);
                        if (dbUser && (dbUser.name || '').trim().length > 0) {
                            finalName = dbUser.name.trim();
                        } else {
                            finalName = 'User'; // Fallback to neutral label if DB is also empty
                        }
                    } catch (e) {
                        finalName = 'User';
                    }
                }
                socket.userName = finalName;

                const room = await getOrCreateRoom(normalizedRoom);
                if (!room.participants) room.participants = new Map();
                room.participants.set(finalUserId, { userId: finalUserId, userName: finalName, userAvatar, socketId: socket.id });

                // Use controller logic to handle waiting room
                const result = await createOrJoinMeeting({ 
                    roomId: normalizedRoom, 
                    userId: finalUserId, 
                    userName: finalName, 
                    userAvatar,
                    socketId: socket.id 
                });

                if (result.status === 'pending') {
                    console.log(`[SOCKET] User ${userId} placed in waiting room for ${normalizedRoom}`);
                    socket.join(`waiting:${normalizedRoom}`);
                    socket.emit('waiting-room-joined', { 
                        title: result.meeting.title,
                        hostId: result.meeting.hostId 
                    });
                    if (callback) callback({ status: 'pending' });
                    return;
                }

                // If active, proceed with joining
                socket.join(normalizedRoom);
                
                // Broadcast join to local instance
                socket.to(normalizedRoom).emit('user-joined', { userId, userName: finalName, userAvatar, socketId: socket.id });

                // Broadcast join to cluster (for horizontal scaling awareness)
                broadcastToCluster(instanceId, {
                    roomId: normalizedRoom,
                    event: 'user-joined',
                    payload: { userId: finalUserId, userName: finalName, userAvatar, socketId: socket.id }
                });

                if (result.isHost) socket.isHost = true;

                if (callback) callback({ status: 'active', ...result, userName: finalName });

                // Sync history
                socket.emit('history-sync', { 
                    messages: result.meeting.chat?.map(c => ({ 
                        id: c._id, from: c.senderId, userName: c.senderName, text: c.text, 
                        timestamp: c.timestamp, isPrivate: c.isPrivate, recipientId: c.recipientId 
                    })) || [],
                    polls: result.meeting.polls?.map(p => ({ 
                        type: 'poll', 
                        poll: p, 
                        timestamp: p.timestamp 
                    })) || []
                });
            } catch (err) {
                // rethrow to let `safeOn` categorize it and suppress the stack trace gracefully
                throw err;
            }
        });


        safeOn('get-router-rtp-capabilities', async (data, callback) => {
            try {
                const room = await getOrCreateRoom(socket.roomId);
                callback(room.router.rtpCapabilities);
            } catch (err) {
                console.error(err);
                callback({ error: err.message });
            }
        });

        safeOn('create-transport', async (data, callback) => {
            try {
                const transportData = await createWebRtcTransport(socket.roomId);
                socket.transports.add(transportData.id);
                callback(transportData);
            } catch (err) {
                console.error(err);
                callback({ error: err.message });
            }
        });

        safeOn('connect-transport', async ({ transportId, dtlsParameters }) => {
            const room = await getOrCreateRoom(socket.roomId);
            const transport = room.transports.get(transportId);
            if (transport) {
                await transport.connect({ dtlsParameters });
            }
        });

        safeOn('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
            const room = await getOrCreateRoom(socket.roomId);
            const transport = room.transports.get(transportId);
            if (!transport) return callback({ error: 'Transport not found' });

            const producer = await transport.produce({ kind, rtpParameters, appData });
            room.producers.set(producer.id, producer);

            producer.on('transportclose', () => producer.close());
            producer.on('close', () => {
                console.log(`[SFU] Producer closed: ${producer.id}`);
                room.producers.delete(producer.id);
            });

            callback({ id: producer.id });

            // Notify others in room (including cluster)
            const eventData = {
                producerId: producer.id,
                userId: socket.userId,
                userName: socket.userName,
                userAvatar: socket.userAvatar,
                socketId: socket.id,
                kind,
                type: appData?.type || 'camera'
            };
            
            // Store metadata in producer appData for later retrieval by new joiners
            producer.appData.userId = socket.userId;
            producer.appData.userName = socket.userName;
            producer.appData.userAvatar = socket.userAvatar;
            producer.appData.type = appData?.type || 'camera';

            socket.to(socket.roomId).emit('new-producer', eventData);
            broadcastToCluster(instanceId, {
                roomId: socket.roomId,
                event: 'new-producer',
                payload: eventData
            });
        });

        safeOn('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
            if (!socket.roomId) return callback({ error: 'No room ID on socket' });
            const room = await getOrCreateRoom(socket.roomId);
            if (!room) return callback({ error: 'Room not found' });

            if (!room.router.canConsume({ producerId, rtpCapabilities })) {
                return callback({ error: 'Cannot consume' });
            }

            const transport = room.transports.get(transportId);
            if (!transport) return callback({ error: 'Transport not found' });

            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: true, 
            });

            room.consumers.set(consumer.id, consumer);

            consumer.on('transportclose', () => consumer.close());
            consumer.on('producerclose', () => {
                consumer.close();
                socket.emit('producer-closed', { producerId });
            });
            consumer.on('close', () => {
                console.log(`[SFU] Consumer closed: ${consumer.id}`);
                room.consumers.delete(consumer.id);
            });

            const producer = room.producers.get(producerId);

            callback({
                id: consumer.id,
                producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                type: producer?.appData?.type || 'camera'
            });
        });

        safeOn('get-producers', async (data, callback) => {
            try {
                const room = await getOrCreateRoom(socket.roomId);
                const producerList = [];
                room.producers.forEach((producer) => {
                    producerList.push({
                        producerId: producer.id,
                        userId: producer.appData.userId,
                        userName: producer.appData.userName,
                        userAvatar: producer.appData.userAvatar,
                        kind: producer.kind,
                        type: producer.appData.type || 'camera'
                    });
                });
                
                // Also provide current state and full metadata of everyone in the room
                const userStates = {};
                const participants = [];
                
                if (room.userStates) {
                    room.userStates.forEach((state, uid) => { userStates[uid] = state; });
                }
                
                if (room.participants) {
                    room.participants.forEach((p) => { 
                        participants.push(p); 
                    });
                }
                
                callback({ producers: producerList, userStates, participants });
            } catch (err) {
                console.error(err);
                callback({ producers: [], userStates: {} });
            }
        });

        safeOn('resume-consumer', async ({ consumerId }) => {
            const room = await getOrCreateRoom(socket.roomId);
            const consumer = room.consumers.get(consumerId);
            if (consumer) {
                await consumer.resume();
            }
        });

        safeOn('producer-closed', async ({ producerId }) => {
            const room = await getOrCreateRoom(socket.roomId);
            const producer = room.producers.get(producerId);
            if (producer) {
                producer.close();
                room.producers.delete(producerId);
                socket.to(socket.roomId).emit('producer-closed', { producerId, userId: socket.userId });
            }
        });

        // --- Chat & State ---

        safeOn('chat-message', async (data) => {
            if (socket.roomId) {
                const payload = {
                    from: socket.userId,
                    userName: socket.userName,
                    userAvatar: socket.userAvatar,
                    text: data.text,
                    timestamp: new Date(),
                    recipientId: data.recipientId || 'all',
                    isPrivate: data.isPrivate || false
                };

                // Persist to DB
                try {
                    const Meeting = mongoose.model('Meeting');
                    await Meeting.updateOne(
                        { roomId: socket.roomId },
                        { $push: { chat: { 
                            senderId: socket.userId, 
                            senderName: socket.userName, 
                            senderAvatar: socket.userAvatar,
                            recipientId: data.recipientId || 'all',
                            isPrivate: data.isPrivate || false,
                            text: data.text
                        } } }
                    );
                } catch(e) { console.error('[DB CHAT ERR]', e); }

                if (payload.isPrivate && payload.recipientId !== 'all') {
                    // Directed message
                    const roomPeers = io.sockets.adapter.rooms.get(socket.roomId);
                    if (roomPeers) {
                        for (const sid of roomPeers) {
                            const s = io.sockets.sockets.get(sid);
                            if (s && String(s.userId) === String(payload.recipientId)) {
                                s.emit('chat-message', payload);
                                break;
                            }
                        }
                    }
                } else {
                    socket.to(socket.roomId).emit('chat-message', payload);
                    broadcastToCluster(instanceId, {
                        roomId: socket.roomId,
                        event: 'chat-message',
                        payload
                    });
                }
            }
        });

        safeOn('whiteboard-draw', (data) => {
            if (socket.roomId) {
                const payload = { ...data, senderId: socket.userId };
                socket.to(socket.roomId).emit('whiteboard-draw', payload);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'whiteboard-draw',
                    payload
                });
            }
        });

        safeOn('whiteboard-clear', (data) => {
            if (socket.roomId) {
                socket.to(socket.roomId).emit('whiteboard-clear', data);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'whiteboard-clear',
                    payload: data
                });
            }
        });

        safeOn('whiteboard-toggle', (data) => {
            if (socket.roomId) {
                socket.to(socket.roomId).emit('whiteboard-toggle', data);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'whiteboard-toggle',
                    payload: data
                });
            }
        });

        safeOn('reaction', async (data) => {
            if (socket.roomId) {
                const payload = { ...data, userId: socket.userId, userName: (socket.userName || '').trim(), userAvatar: socket.userAvatar };
                // Send to others
                socket.to(socket.roomId).emit('reaction', payload);
                // Also send back to self if locally we want to be sure, but MeetingRoom usually handles it
                // socket.emit('reaction', payload); 
                
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'reaction',
                    payload
                });
            }
        });

        safeOn('state-update', async (data) => {
            if (socket.roomId) {
                const room = await getOrCreateRoom(socket.roomId);
                if (!room.userStates) room.userStates = new Map();
                room.userStates.set(socket.userId, data.state);

                const payload = { uid: socket.userId, state: data.state };
                socket.to(socket.roomId).emit('state-update', payload);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'state-update',
                    payload
                });
            }
        });
        safeOn('admin-mute', (data) => {
            if (socket.roomId && socket.isHost) {
                const payload = { targetUserId: data.targetUserId };
                socket.to(socket.roomId).emit('admin-mute', payload);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'admin-mute',
                    payload
                });
            }
        });
        safeOn('admin-unmute', (data) => {
            if (socket.roomId && socket.isHost) {
                const payload = { targetUserId: data.targetUserId };
                socket.to(socket.roomId).emit('admin-unmute', payload);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'admin-unmute',
                    payload
                });
            }
        });


        safeOn('create-poll', async (data) => {
            if (socket.roomId) {
                const pollId = `poll_${Date.now()}`;
                const pollData = { 
                    id: pollId, 
                    creatorId: socket.userId, 
                    creatorName: socket.userName, 
                    question: data.question,
                    options: data.options.map(o => ({ text: o, votes: [] })),
                    timestamp: new Date()
                };
                
                const payload = { type: 'poll', poll: pollData, timestamp: pollData.timestamp };

                // Persist
                try {
                    const Meeting = mongoose.model('Meeting');
                    await Meeting.updateOne(
                        { roomId: socket.roomId },
                        { $push: { polls: pollData } }
                    );
                } catch(e) {}

                // Use ioInstance to ensure the creator also receives the message in real-time
                const ioInstance = getIO();
                if (ioInstance) {
                    ioInstance.to(socket.roomId).emit('new-poll', payload);
                } else {
                    socket.to(socket.roomId).emit('new-poll', payload);
                    socket.emit('new-poll', payload);
                }

                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'new-poll',
                    payload
                });
            }
        });

        safeOn('vote-poll', async (data) => {
            if (socket.roomId) {
                // If it's a close action
                if (data.action === 'close') {
                    try {
                        const Meeting = mongoose.model('Meeting');
                        const pId = typeof data.pollId === 'object' ? data.pollId.pollId : data.pollId;
                        
                        await Meeting.updateOne(
                            { roomId: socket.roomId, "polls.id": pId },
                            { $set: { "polls.$.status": 'closed' } }
                        );
                        
                        const payload = { pollId: pId, status: 'closed' };
                        const ioInstance = getIO();
                        if (ioInstance) {
                            ioInstance.to(socket.roomId).emit('poll-closed', payload);
                        } else {
                            socket.to(socket.roomId).emit('poll-closed', payload);
                            socket.emit('poll-closed', payload);
                        }

                        broadcastToCluster(instanceId, {
                            roomId: socket.roomId,
                            event: 'poll-closed',
                            payload
                        });
                        return;
                    } catch(e) {
                         console.error('[DB POLL CLOSE ERR]', e);
                    }
                }

                const pId = typeof data.pollId === 'object' ? data.pollId.pollId : data.pollId;
                const oIdx = typeof data.optionIndex === 'object' ? data.optionIndex.optionIndex : data.optionIndex;

                const payload = { 
                    pollId: pId, 
                    optionIndex: oIdx, 
                    userId: socket.userId,
                    action: data.action
                };
                
                // Persist
                try {
                    const Meeting = mongoose.model('Meeting');
                    await Meeting.updateOne(
                        { roomId: socket.roomId, "polls.id": pId },
                        { $pull: { "polls.$.options.$[].votes": socket.userId } }
                    );
                    await Meeting.updateOne(
                        { roomId: socket.roomId, "polls.id": pId },
                        { $addToSet: { [`polls.$.options.${oIdx}.votes`]: socket.userId } }
                    );
                } catch(e) { console.error('[DB VOTE ERR]', e); }

                const ioInstance = getIO();
                if (ioInstance) {
                    ioInstance.to(socket.roomId).emit('poll-vote', payload);
                } else {
                    socket.to(socket.roomId).emit('poll-vote', payload);
                    socket.emit('poll-vote', payload);
                }

                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'poll-vote',
                    payload
                });
            }
        });


        safeOn('profile-update', (data) => {
            if (socket.roomId) {
                const name = data.userName || data.name;
                const pic = data.userAvatar || data.pic;
                
                if (name) socket.userName = name;
                if (pic) socket.userAvatar = pic;
                
                const payload = { userId: socket.userId, userName: name, userAvatar: pic };
                socket.to(socket.roomId).emit('profile-update', payload);
                broadcastToCluster(instanceId, {
                    roomId: socket.roomId,
                    event: 'profile-update',
                    payload
                });
            }
        });

        socket.on('disconnect', async () => {
            console.log(`[SOCKET] Disconnected: ${socket.id}`);
            
            // Cleanup Mediasoup Resources
            if (socket.roomId) {
                try {
                    const room = await getOrCreateRoom(socket.roomId);
                    if (room) {
                        socket.transports.forEach(transportId => {
                            const transport = room.transports.get(transportId);
                            if (transport) {
                                transport.close();
                                room.transports.delete(transportId);
                            }
                        });
                        
                        // broadcast leaving
                        const payload = { userId: socket.userId, socketId: socket.id };
                        socket.to(socket.roomId).emit('user-left', payload);
                        broadcastToCluster(instanceId, {
                            roomId: socket.roomId,
                            event: 'user-left',
                            payload
                        });
                    }
                } catch (err) {
                    console.error('[DISCONNECT CLEANUP ERR]', err);
                }
            }
        });
    });

    return io;
};
