import 'dotenv/config';
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => originalLog(`[${new Date().toISOString()}]`, ...args);
console.error = (...args) => originalError(`[${new Date().toISOString()}]`, ...args);

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from './models/User.js';
import meetingRoutes from './routes/meetingRoutes.js';
import recordingRoutes from './routes/recordingRoutes.js';
import vexaRoutes from './routes/vexaRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { getCacheStats } from './cache.js';
import { initSocket } from './socket.js';
import { initMediasoup } from './mediasoup.js';
import { initClusterBus } from './clusterBus.js';

const app = express();
export const instanceId = crypto.randomBytes(4).toString('hex');


app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-user-name', 'x-user-avatar']
}));

app.use(express.json({ limit: '50mb' }));

let isConnected = false;
let connectionPromise = null;

const connectDB = async () => {
    if (isConnected && mongoose.connection.readyState === 1) return;
    if (connectionPromise) return connectionPromise;

    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    }).then(() => {
        isConnected = true;
        console.log('✅ Connected to MongoDB');
        User.findOne({ email: 'admin@gmail.com' }).then(async (admin) => {
            if (!admin) {
                const newAdmin = new User({ email: 'admin@gmail.com', password: 'Megamix@123', name: 'Super Admin' });
                await newAdmin.save();
                console.log('✅ Admin user seeded');
            }
        }).catch(err => console.error('Admin seed error:', err.message));
        connectionPromise = null;
    }).catch(err => {
        isConnected = false;
        connectionPromise = null;
        console.error('❌ MongoDB Connection Error:', err.message);
        throw err;
    });

    return connectionPromise;
};

app.use(async (req, res, next) => {
    req.instanceId = instanceId;
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(503).json({ error: 'Database unavailable', detail: err.message });
    }
});


app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/vexa', vexaRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now(), instance: instanceId }));

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();
        await initMediasoup();
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 API Server [${instanceId}] on port ${PORT}`);
        });

        await initClusterBus(instanceId, async (msg) => {
            const { getIO } = await import('./socket.js');
            const io = getIO();
            if (io) {
                if (msg.targetUserId) {
                    io.to(msg.targetUserId).emit(msg.event, msg.payload);
                } else if (msg.roomId) {
                    io.to(msg.roomId).emit(msg.event, msg.payload);
                }
            }
        });

        initSocket(server, instanceId);

        process.on('SIGTERM', () => server.close());
        process.on('SIGINT', () => server.close());
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();