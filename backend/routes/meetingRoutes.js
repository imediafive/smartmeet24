import express from 'express';
import mongoose from 'mongoose';
import Meeting from '../models/Meeting.js';
import {
    getMeetingHistory, scheduleMeeting, joinMeeting, finishMeeting, leaveMeeting,
    saveChatMessage, savePersonalNotes, getPersonalNotes, updateMeetingTitle, pulse,
    approveParticipant, rejectParticipant
} from '../controllers/meetingController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { getIO } from '../socket.js';
import { broadcastToCluster } from '../clusterBus.js';


const router = express.Router();

router.get('/history', authMiddleware, getMeetingHistory);
router.get('/status/:roomId', authMiddleware, async (req, res) => {
    try {
        const { roomId } = req.params;
        const meeting = await Meeting.findOne({ roomId: roomId.toLowerCase() }).select('status title hostId participants').lean();
        if (!meeting) return res.json({ status: 'active', title: 'New Meeting', participants: [] });
        
        // Filter to only show active participants
        const activeParticipants = (meeting.participants || []).filter(p => p.isActive);
        
        res.json({ 
            status: meeting.status, 
            title: meeting.title, 
            hostId: meeting.hostId,
            participants: activeParticipants
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify meeting status' });
    }
});
router.post('/schedule', authMiddleware, scheduleMeeting);

router.post('/join', authMiddleware, joinMeeting);
router.post('/leave/:roomId', authMiddleware, leaveMeeting);
router.post('/end/:roomId', authMiddleware, finishMeeting);
router.post('/chat/:roomId', authMiddleware, saveChatMessage);
router.post('/notes/:roomId', authMiddleware, savePersonalNotes);
router.get('/notes/:roomId', authMiddleware, getPersonalNotes);
router.patch('/title/:roomId', authMiddleware, updateMeetingTitle);
router.post('/pulse/:roomId', authMiddleware, pulse);
router.post('/approve/:roomId', authMiddleware, approveParticipant);
router.post('/reject/:roomId', authMiddleware, rejectParticipant);
router.get('/chat/:roomId', authMiddleware, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.auth.userId;
        const meeting = await Meeting.findOne({ roomId }).select('chat').lean();
        
        if (!meeting) return res.json([]);

        // Filter: Show only if (all) OR (sent by me) OR (targeted to me)
        const visibleChat = (meeting.chat || []).filter(msg => {
            return msg.recipientId === 'all' || 
                   String(msg.senderId) === String(userId) || 
                   String(msg.recipientId) === String(userId);
        });

        res.json(visibleChat);
    } catch (err) {
        console.error('[POLL] Chat fetch failed:', err);
        res.status(500).json({ error: 'Failed' });
    }
});
router.get('/participants/:roomId', authMiddleware, async (req, res) => {
    try {
        const { roomId } = req.params;
        const meeting = await Meeting.findOne({ roomId }).select('participants').lean();
        res.json(meeting?.participants || []);
    } catch (err) {
        console.error('[POLL] Participants fetch failed:', err);
        res.status(500).json({ error: 'Failed' });
    }
});
router.post('/react/:roomId', authMiddleware, (req, res) => {
    const { roomId } = req.params;
    const { key, name } = req.body;
    const io = getIO();
    const payload = { key, name };
    if (io) io.to(roomId.toLowerCase()).emit('reaction', payload);
    broadcastToCluster(req.instanceId, { roomId: roomId.toLowerCase(), event: 'reaction', payload });
    res.json({ success: true });
});

router.post('/state/:roomId', authMiddleware, (req, res) => {
    const { roomId } = req.params;
    const { uid, state } = req.body;
    const io = getIO();
    const payload = { uid, state };
    if (io) io.to(roomId.toLowerCase()).emit('state-update', payload);
    broadcastToCluster(req.instanceId, { roomId: roomId.toLowerCase(), event: 'state-update', payload });
    res.json({ success: true });
});

router.post('/profile/:roomId', authMiddleware, (req, res) => {
    const { roomId } = req.params;
    const { uid, name, pic } = req.body;
    const io = getIO();
    const payload = { uid, name, pic };
    if (io) io.to(roomId.toLowerCase()).emit('profile-update', payload);
    broadcastToCluster(req.instanceId, { roomId: roomId.toLowerCase(), event: 'profile-update', payload });
    res.json({ success: true });
});


router.post('/admin-mute/:roomId', authMiddleware, (req, res) => {
    const roomId = (req.params.roomId || '').toLowerCase().trim();
    const { targetUid, action } = req.body;
    const io = getIO();
    const payload = { targetUid, action };
    if (io) io.to(roomId).emit('admin-mute', payload);
    broadcastToCluster(req.instanceId, { roomId, event: 'admin-mute', payload });
    res.json({ success: true });
});


router.post('/whiteboard/:roomId', authMiddleware, (req, res) => {
    const roomId = (req.params.roomId || '').toLowerCase().trim();
    const io = getIO();
    if (io) io.to(roomId).emit('whiteboard-draw', req.body);
    broadcastToCluster(req.instanceId, { roomId, event: 'whiteboard-draw', payload: req.body });
    res.json({ success: true });
});


router.post('/whiteboard-toggle/:roomId', authMiddleware, (req, res) => {
    const roomId = (req.params.roomId || '').toLowerCase().trim();
    const { visible, senderId } = req.body;
    const io = getIO();
    const payload = { visible, senderId };
    if (io) io.to(roomId).emit('whiteboard-toggle', payload);
    broadcastToCluster(req.instanceId, { roomId, event: 'whiteboard-toggle', payload });
    res.json({ success: true });
});


export default router;
