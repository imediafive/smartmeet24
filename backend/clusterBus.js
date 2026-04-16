import mongoose from 'mongoose';

const clusterBusSchema = new mongoose.Schema({
    sourceInstance: { type: String, required: true },
    targetUserId: { type: String },
    roomId: { type: String },
    event: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true }
}, { 
    capped: { size: 1048576 * 10, max: 10000 }, // 10MB capped collection
    timestamps: false 
});

const ClusterBus = mongoose.model('ClusterBus', clusterBusSchema);

export const initClusterBus = async (instanceId, onMessage) => {
    console.log(`[CLUSTER] Initializing Bus for Instance: ${instanceId}`);
    
    // Tailable cursor implementation
    const cursor = ClusterBus.find({
        timestamp: { $gte: new Date() }
    }).tailable(true, { awaitData: true }).cursor();

    cursor.on('data', (doc) => {
        // Only process messages NOT from ourselves
        if (doc.sourceInstance !== instanceId) {
            onMessage(doc);
        }
    });

    cursor.on('error', (err) => {
        console.error('[CLUSTER BUS ERROR]', err);
        // Attempt to restart cursor after error
        setTimeout(() => initClusterBus(instanceId, onMessage), 5000);
    });

    return ClusterBus;
};

export const broadcastToCluster = async (instanceId, data) => {
    try {
        await ClusterBus.create({
            sourceInstance: instanceId,
            ...data
        });
    } catch (err) {
        console.error('[CLUSTER BROADCAST ERROR]', err);
    }
};

export default ClusterBus;
