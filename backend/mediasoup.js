import * as mediasoup from 'mediasoup';
import os from 'os';

let workers = [];
let nextWorkerIdx = 0;

// Room mapping: roomId -> { router, transport, producers, consumers }
const rooms = new Map();

export const initMediasoup = async () => {
    const numWorkers = 2; // Reduced from os.cpus().length for better stability
    console.log(`[MEDIASOUP] Starting ${numWorkers} workers...`);

    for (let i = 0; i < numWorkers; i++) {
        try {
            const worker = await mediasoup.createWorker({
                logLevel: 'warn',
                rtcMinPort: 40000,
                rtcMaxPort: 49999,
            });

            worker.on('died', () => {
                console.error(`[MEDIASOUP] Worker died, not exiting process to allow PM2 to keep other instances alive.`);
                // In a clustered environment, we might want to exit, but let's see why it's dying first.
                // For now, let's just log and see if we can recover or if it's a fatal setup issue.
            });

            workers.push(worker);
        } catch (err) {
            console.error(`[MEDIASOUP] Failed to create worker:`, err);
        }
    }
};

const getNextWorker = () => {
    const worker = workers[nextWorkerIdx];
    nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
    return worker;
};

export const getOrCreateRoom = async (roomId) => {
    if (rooms.has(roomId)) {
        return rooms.get(roomId);
    }

    const worker = getNextWorker();
    const mediaCodecs = [
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
        },
        {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
                'x-google-start-bitrate': 1000,
            },
        },
    ];

    const router = await worker.createRouter({ mediaCodecs });
    const roomState = {
        router,
        transports: new Map(), // transportId -> transport
        producers: new Map(),  // producerId -> producer
        consumers: new Map(),  // consumerId -> consumer
    };

    rooms.set(roomId, roomState);
    return roomState;
};

export const createWebRtcTransport = async (roomId) => {
    const room = await getOrCreateRoom(roomId);
    const { router } = room;

    const transport = await router.createWebRtcTransport({
        listenIps: [
            {
                ip: '0.0.0.0',
                announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
            },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
            transport.close();
        }
    });

    transport.on('close', () => {
        console.log(`[MEDIASOUP] Transport closed in room ${roomId}`);
    });

    room.transports.set(transport.id, transport);

    return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
    };
};
