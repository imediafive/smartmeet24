import Meeting from '../models/Meeting.js';
import Transcript from '../models/Transcript.js';
import mongoose from 'mongoose';
import {
    getCachedRoom, setCachedRoom, patchCachedRoom, patchCachedParticipant,
    evictRoom, getCachedHistory, setCachedHistory, invalidateHistory, invalidateAllHistory,
    recordHit, recordMiss,
} from '../cache.js';
import { broadcastToCluster } from '../clusterBus.js';
import { getIO } from '../socket.js';

export const getMeetingHistory = async (req, res) => {
    try {
        const userId = req.auth.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const now = new Date();
        // Janitor task: close stale meetings (could be a separate worker, but keeping it here for simplicity as per existing pattern)
        const activeMeetings = await Meeting.find({ status: 'active' });
        for (const m of activeMeetings) {
            const liveCount = m.participants.filter(p => 
                p.isActive && p.lastSeen && (now - p.lastSeen < 120000)
            ).length;
            
            if (liveCount === 0) {
                await endMeeting(m.roomId);
            }
        }

        const total = await Meeting.countDocuments({
            $or: [{ hostId: userId }, { 'participants.userId': userId }]
        });

        const meetings = await Meeting.find({
            $or: [{ hostId: userId }, { 'participants.userId': userId }]
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('roomId hostId title status scheduleTime startTime endTime createdAt participants')
            .lean();

        // Populate participant details (Email, etc.) from User collection
        // Since userId is stored as string/Clerk ID, we fetch manually
        const allUserIds = new Set();
        meetings.forEach(m => {
            m.participants?.forEach(p => allUserIds.add(p.userId));
            allUserIds.add(m.hostId);
        });

        const User = mongoose.model('User');
        const userDocs = await User.find({ 
            $or: [
                { _id: { $in: Array.from(allUserIds).filter(id => mongoose.Types.ObjectId.isValid(id)) } },
                { googleId: { $in: Array.from(allUserIds) } }
            ]
        }).select('email name avatar googleId').lean();

        const userMap = {};
        userDocs.forEach(u => {
            userMap[String(u._id)] = u;
            if (u.googleId) userMap[u.googleId] = u;
        });

        const roomIds = meetings.map(m => m.roomId);
        const Transcript = mongoose.model('Transcript');
        const transcripts = await Transcript.find({ meetingId: { $in: roomIds } }).select('meetingId').lean();
        const transcriptMap = new Set(transcripts.map(t => t.meetingId));

        const finalMeetings = meetings.map(m => ({
            ...m,
            hasNotes: transcriptMap.has(m.roomId),
            hostDetails: userMap[m.hostId] || { name: 'Unknown Host' },
            participants: m.participants?.map(p => ({
                ...p,
                ...(userMap[p.userId] || {})
            })) || []
        }));

        res.json({
            meetings: finalMeetings,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('[HISTORY ERROR]', err);
        res.status(500).json({ error: 'Failed' });
    }
};

export const scheduleMeeting = async (req, res) => {
    try {
        const { title, scheduleTime, roomId } = req.body;
        const hostId = req.auth.userId;

        const meeting = await Meeting.create({
            roomId: roomId.toLowerCase(),
            hostId,
            title,
            scheduleTime: new Date(scheduleTime),
            status: 'scheduled',
            participants: [],
        });

        setCachedRoom(meeting);
        invalidateHistory(hostId);

        res.status(201).json(meeting);
    } catch (err) {
        console.error('Failed to schedule meeting:', err.message);
        res.status(500).json({ error: 'Failed to schedule meeting', detail: err.message });
    }
};

export const joinMeeting = async (req, res) => {
    try {
        const { roomId: rawRoomId, userName: bodyName, userAvatar: bodyAvatar, agoraUid } = req.body;
        const roomId = (rawRoomId?.trim() || '').toLowerCase();
        const userId = req.auth.userId;
        const userName = bodyName || req.headers['x-user-name'] || 'User';
        const userAvatar = bodyAvatar || req.headers['x-user-avatar'] || '';
        const socketId = req.headers['x-session-id'] || 'no-session';
        const inviteUrl = `${req.headers.origin}/?room=${roomId}`;

        const result = await createOrJoinMeeting({ roomId, userId, userName, userAvatar, agoraUid, socketId, inviteUrl });
        console.log(`[JOIN] User ${userId} joined room ${roomId}`);
        res.json(result);
    } catch (err) {
        console.error('Join meeting failed:', err.message);
        res.status(400).json({ error: err.message });
    }
};

export const createOrJoinMeeting = async ({ roomId, userId, userName, userAvatar, agoraUid, socketId, inviteUrl }) => {
    let meeting = await Meeting.findOne({ roomId })
        .select('roomId hostId hostSocketId inviteUrl title status participants waitingRoom startTime')
        .lean();

    if (!meeting) {
        // Create as host
        meeting = await Meeting.create({
            roomId,
            hostId: userId,
            hostSocketId: socketId,
            inviteUrl,
            title: `Meeting ${roomId.toUpperCase()}`,
            status: 'active',
            participants: [{ userId, socketId, name: userName, avatar: userAvatar, isActive: true, agoraUid, lastSeen: new Date() }],
            startTime: new Date()
        });
        setCachedRoom(meeting);
        return { meeting, isHost: true };
    }

    if (meeting.status === 'ended') {
        const isHostJoining = String(meeting.hostId) === String(userId);
        if (isHostJoining) {
            // Reactivate meeting if host returns
            await Meeting.updateOne({ roomId }, { $set: { status: 'active', endTime: null } });
            meeting.status = 'active';
            meeting.endTime = null;
        } else {
            throw new Error('Meeting has already ended');
        }
    }

    const isHost = String(meeting.hostId) === String(userId);
    const isApproved = meeting.participants.some(p => String(p.userId) === String(userId));

    if (isHost || isApproved) {
        const needsActivate = meeting.status === 'scheduled';
        const alreadyIn = meeting.participants.find(p => String(p.userId) === String(userId));
        
        let updateData;
        if (alreadyIn) {
            updateData = {
                $set: {
                    status: needsActivate ? 'active' : meeting.status,
                    startTime: (needsActivate || !meeting.startTime) ? new Date() : meeting.startTime,
                    endTime: null,
                    "participants.$.isActive": true,
                    "participants.$.socketId": socketId,
                    "participants.$.lastSeen": new Date(),
                    "participants.$.leftAt": null
                }
            };
            // Host persistence check
            if (needsActivate && !meeting.participants.some(p => p.isActive && String(p.userId) === String(meeting.hostId))) {
               updateData.$set.hostId = userId;
               updateData.$set.hostSocketId = socketId;
            } else if (isHost) {
               updateData.$set.hostSocketId = socketId;
            }
            meeting = await Meeting.findOneAndUpdate({ roomId, "participants.userId": userId }, updateData, { returnDocument: 'after' });
        } else {
            updateData = {
                $set: {
                    status: needsActivate ? 'active' : meeting.status,
                    startTime: (needsActivate || !meeting.startTime) ? new Date() : meeting.startTime,
                    endTime: null
                },
                $push: { participants: { userId, socketId, name: userName, avatar: userAvatar, isActive: true, agoraUid, lastSeen: new Date(), joinedAt: new Date() } }
            };
            if (needsActivate && !meeting.participants.some(p => p.isActive && String(p.userId) === String(meeting.hostId))) {
                updateData.$set.hostId = userId;
                updateData.$set.hostSocketId = socketId;
            } else if (isHost) {
                updateData.$set.hostSocketId = socketId;
            }
            meeting = await Meeting.findOneAndUpdate({ roomId }, updateData, { returnDocument: 'after' });
        }
        setCachedRoom(meeting);
        
        // Broadcast join event
        const io = getIO();
        if (io) {
            io.to(roomId.toLowerCase()).emit('user-joined', { userId, userName, userAvatar, agoraUid });
        }
        
        invalidateAllHistory();
        return { meeting, isHost: String(meeting.hostId) === String(userId) };
    } else {
        // Add to waiting room if not already there
        const alreadyWaiting = meeting.waitingRoom.some(w => String(w.userId) === String(userId));
        if (!alreadyWaiting) {
            meeting = await Meeting.findOneAndUpdate(
                { roomId },
                { $push: { waitingRoom: { userId, socketId, name: userName, avatar: userAvatar, requestedAt: new Date() } } },
                { returnDocument: 'after' }
            );
            // Broadcast to host/others that someone is waiting
            const io = getIO();
            if (io) {
                io.to(roomId.toLowerCase()).emit('waiting-room-update', { 
                    type: 'request',
                    userId, 
                    userName, 
                    userAvatar,
                    waitingRoom: meeting.waitingRoom 
                });
            }
        }
        return { 
            status: 'pending', 
            meeting: { 
                title: meeting.title, 
                hostId: meeting.hostId,
                waitingRoom: meeting.waitingRoom 
            } 
        };
    }
};

export const approveParticipant = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { targetUserId } = req.body;
        const hostId = req.auth.userId;

        const meeting = await Meeting.findOne({ roomId });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (String(meeting.hostId) !== String(hostId)) return res.status(403).json({ error: 'Only host can approve' });

        const waiter = meeting.waitingRoom.find(w => String(w.userId) === String(targetUserId));
        if (!waiter) return res.status(404).json({ error: 'User not in waiting room' });

        // Move to participants (inactive until they actually join)
        const updated = await Meeting.findOneAndUpdate(
            { roomId },
            {
                $pull: { waitingRoom: { userId: targetUserId } },
                $push: { participants: { userId: targetUserId, name: waiter.name, avatar: waiter.avatar, isActive: false } }
            },
            { returnDocument: 'after' }
        );

        setCachedRoom(updated);

        // Broadcast approval to the specific user and everyone else
        const io = getIO();
        if (io) {
            io.to(roomId.toLowerCase()).emit('participant-approved', { userId: targetUserId });
            io.to(`waiting:${roomId.toLowerCase()}`).emit('participant-approved', { userId: targetUserId });
            io.to(roomId.toLowerCase()).emit('waiting-room-update', { 
                type: 'approved', 
                userId: targetUserId,
                waitingRoom: updated.waitingRoom 
            });
        }


        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Approval failed' });
    }
};

export const rejectParticipant = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { targetUserId } = req.body;
        const hostId = req.auth.userId;

        const meeting = await Meeting.findOne({ roomId });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (String(meeting.hostId) !== String(hostId)) return res.status(403).json({ error: 'Only host can reject' });

        const updated = await Meeting.findOneAndUpdate(
            { roomId },
            { $pull: { waitingRoom: { userId: targetUserId } } },
            { returnDocument: 'after' }
        );

        setCachedRoom(updated);

        const io = getIO();
        if (io) {
            io.to(roomId.toLowerCase()).emit('participant-rejected', { userId: targetUserId });
            io.to(roomId.toLowerCase()).emit('waiting-room-update', { 
                type: 'rejected', 
                userId: targetUserId,
                waitingRoom: updated.waitingRoom 
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Rejection failed' });
    }
};


export const participantLeft = async ({ roomId, userId, socketId }) => {
    patchCachedParticipant(roomId, userId, { isActive: false, socketId: null });
    const query = socketId ? { roomId, 'participants.socketId': socketId } : { roomId, 'participants.userId': userId };

    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) return;

    const isHost = String(meeting.hostId) === String(userId);
    let updated;

    // Host just becomes inactive
    updated = await Meeting.findOneAndUpdate(
        query,
        { $set: { 'participants.$.isActive': false, 'participants.$.leftAt': new Date() } },
        { returnDocument: 'after' }
    );

    if (updated) {
        const io = getIO();
        if (io) {
            io.to(roomId.toLowerCase()).emit('user-left', {
                userId,
                userName: isHost ? 'Host' : 'Participant'
            });
        }
    }

    // Check if anyone else is still active in the room
    const m = await Meeting.findOne({ roomId }).lean();
    if (m && m.status === 'active') {
        const stillIn = m.participants.some(p => p.isActive);
        if (!stillIn) {
            console.log(`[EXIT] Last user left room ${roomId}. Ending meeting.`);
            await endMeeting(roomId);
        }
    }
};

export const reassignHost = async ({ roomId, newHostSocketId, newHostUserId }) => {
    patchCachedRoom(roomId, { hostId: newHostUserId, hostSocketId: newHostSocketId });
    Meeting.updateOne(
        { roomId },
        { $set: { hostId: newHostUserId, hostSocketId: newHostSocketId } }
    ).catch(() => { });
};

export const leaveMeeting = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase();
        const userId = req.auth.userId;
        await participantLeft({ roomId, userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to leave' });
    }
};

export const finishMeeting = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase();
        const userId = req.auth.userId;

        const meeting = await Meeting.findOne({ roomId });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

        const isParticipant = meeting.participants.some(p => p.userId === userId && p.isActive);
        if (meeting.hostId !== userId && !isParticipant) {
            return res.status(403).json({ error: 'Unauthorized to end this meeting' });
        }

        await endMeeting(roomId);
        res.json({ success: true });
    } catch (err) {
        console.error('[END ERROR]', err);
        res.status(500).json({ error: 'Failed to end meeting' });
    }
};

export const updateMeetingTitle = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase().trim();
        const { title } = req.body;
        const userId = req.auth.userId;

        const meeting = await Meeting.findOne({ roomId });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

        if (meeting.hostId !== userId) {
            return res.status(403).json({ error: 'Only the host can rename the meeting' });
        }

        meeting.title = title;
        await meeting.save();
        
        // Evict from cache to ensure title update is seen
        evictRoom(roomId);
        invalidateAllHistory();

        // Broadcast title update
        const io = getIO();
        if (io) {
            io.to(roomId).emit('title-update', { title, senderId: userId });
        }

        res.json({ success: true, title });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update title' });
    }
};

export const pulse = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase().trim();
        const userId = req.auth.userId;
        
        await Meeting.updateOne(
            { roomId, "participants.userId": userId },
            { $set: { "participants.$.lastSeen": new Date(), "participants.$.isActive": true } }
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Pulse failed' });
    }
};

export const endMeeting = async (roomId) => {
    if (!roomId) return;
    const nRoomId = String(roomId).toLowerCase();
    console.log(`[STATUS] Terminating room ${nRoomId}...`);
    try {
        // 1. Update DB first
        const updated = await Meeting.findOneAndUpdate(
            { roomId: nRoomId },
            { $set: { status: 'ended', endTime: new Date() } },
            { returnDocument: 'after' }
        );

        // Ensure startTime is not stale if the meeting took a while to start
        if (updated && updated.participants?.length > 0) {
            const earliestJoin = Math.min(...updated.participants.map(p => p.joinedAt?.getTime()).filter(t => t));
            if (earliestJoin && (!updated.startTime || updated.startTime.getTime() > earliestJoin)) {
                await Meeting.updateOne({ roomId: nRoomId }, { $set: { startTime: new Date(earliestJoin) } });
            }
        }

        const io = getIO();
        if (io) {
            io.to(nRoomId).emit('meeting-ended', { roomId: nRoomId });
        }

        // 3. Broadcast to cluster for other instances
        broadcastToCluster(process.env.INSTANCE_ID || 'local', {
            roomId: nRoomId,
            event: 'meeting-ended',
            payload: { roomId: nRoomId }
        });


        // 3. Kill room cache safely
        try { evictRoom(nRoomId); } catch(e) {}

        // 4. Clear history
        try { invalidateAllHistory(); } catch(e) {}
        console.log(`[STATUS] Room ${nRoomId} terminated successfully.`);

    } catch (err) {
        console.error('[CRITICAL END ERROR]', err);
    }
};

export const saveChatMessage = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase().trim();
        const { text, senderName, senderAvatar, recipientId, recipientName, isPrivate } = req.body;
        const senderId = req.auth.userId;
        const chatMsg = { 
            senderId, 
            senderName, 
            senderAvatar, 
            text, 
            recipientId: recipientId || 'all',
            recipientName: recipientName || (recipientId === 'all' ? 'Everyone' : 'Participant'),
            isPrivate: !!isPrivate,
            timestamp: new Date() 
        };

        await Meeting.updateOne(
            { roomId },
            { $push: { chat: chatMsg } }
        );

        // Broadcast via Socket.io
        const io = getIO();
        if (io) {
            io.to(roomId).emit('chat-message', chatMsg);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save message' });
    }
};

export const savePersonalNotes = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase().trim();
        const { content } = req.body;
        const userId = req.auth.userId;
        const userName = req.headers['x-user-name'] || 'User';
        const userAvatar = req.headers['x-user-avatar'] || '';

        const meeting = await Meeting.findOne({ roomId });
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

        const noteIdx = meeting.personalNotes.findIndex(n => n.userId === userId);
        if (noteIdx >= 0) {
            meeting.personalNotes[noteIdx].content = content;
            meeting.personalNotes[noteIdx].userName = userName;
            meeting.personalNotes[noteIdx].userAvatar = userAvatar;
        } else {
            meeting.personalNotes.push({ userId, userName, userAvatar, content });
        }

        await meeting.save();
        res.json({ success: true, notes: content });
    } catch (err) {
        console.error('[NOTES ERROR]', err);
        res.status(500).json({ error: 'Failed to save notes' });
    }
};

export const getPersonalNotes = async (req, res) => {
    try {
        const roomId = (req.params.roomId || '').toLowerCase().trim();
        const userId = req.auth.userId;

        const meeting = await Meeting.findOne({ roomId }).select('personalNotes').lean();
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

        const note = meeting.personalNotes?.find(n => n.userId === userId);
        res.json({ content: note?.content || '' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
};

export { Meeting };
