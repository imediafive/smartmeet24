import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    socketId: { type: String },
    name: { type: String },
    avatar: { type: String },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date },
    isActive: { type: Boolean, default: true },
    agoraUid: { type: Number },
    lastSeen: { type: Date, default: Date.now },
}, { _id: false });

const meetingSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true, index: true },
    hostId: { type: String, required: true },
    hostSocketId: { type: String },
    inviteUrl: { type: String },
    title: { type: String, default: 'Untitled Meeting' },
    participants: [participantSchema],
    waitingRoom: [{
        userId: { type: String, required: true },
        socketId: { type: String },
        name: { type: String },
        avatar: { type: String },
        requestedAt: { type: Date, default: Date.now },
    }],
    status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'active' },
    startTime: { type: Date, default: Date.now },
    scheduleTime: { type: Date },
    endTime: { type: Date },
    chat: [{
        senderId: { type: String, required: true },
        senderName: { type: String },
        senderAvatar: { type: String },
        recipientId: { type: String, default: 'all' },
        isPrivate: { type: Boolean, default: false },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
    }],
    polls: [{
        id: { type: String, required: true },
        creatorId: { type: String },
        creatorName: { type: String },
        question: { type: String },
        options: [{
            text: { type: String },
            votes: [String] // Array of userIds
        }],
        timestamp: { type: Date, default: Date.now }
    }],
    personalNotes: [{
        userId: { type: String, required: true },
        userName: { type: String },
        userAvatar: { type: String },
        content: { type: String, default: '' },
    }],
}, { timestamps: true });

meetingSchema.index({ roomId: 1, status: 1 });
meetingSchema.index({ hostId: 1, createdAt: -1 });
meetingSchema.index({ 'participants.userId': 1, 'participants.isActive': 1 });
// Composite index for efficient fetching of active meetings by room and time
meetingSchema.index({ roomId: 1, startTime: -1 });


const Meeting = mongoose.model('Meeting', meetingSchema);
export default Meeting;
