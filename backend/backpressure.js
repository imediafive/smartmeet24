import { setImmediate } from 'timers';

class BackpressureManager {
    constructor() {
        this.eventLoopLag = 0;
        this.queue = [];
        this.maxQueueSize = 500;
        this.isProcessing = false;
        this.lagThreshold = 100; // ms
        
        // Simple lag monitor
        this.monitorLag();
    }

    monitorLag() {
        let start = Date.now();
        setImmediate(() => {
            let lag = Date.now() - start;
            this.eventLoopLag = lag;
            this.monitorLag();
        });
    }

    /**
     * @param {Function} task - The signaling task to perform
     * @param {Object} res - Express response if available, or Socket for signaling
     */
    enqueue(task, socket = null) {
        if (this.eventLoopLag > this.lagThreshold && this.queue.length > this.maxQueueSize) {
            console.warn(`[BACKPRESSURE] Dropping request. Lag: ${this.eventLoopLag}ms, Queue: ${this.queue.length}`);
            if (socket) {
                socket.emit('error', { code: 503, message: 'Server under high load. Please retry.' });
            }
            return false;
        }

        this.queue.push(task);
        this.processQueue();
        return true;
    }

    processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        
        // Process in microtasks to keep loop healthy
        setImmediate(async () => {
            const task = this.queue.shift();
            try {
                await task();
            } catch (err) {
                console.error('[BACKPRESSURE] Task failed', err);
            } finally {
                this.isProcessing = false;
                // Continue processing if there's more
                if (this.queue.length > 0) {
                    this.processQueue();
                }
            }
        });
    }

    getStats() {
        return {
            lag: this.eventLoopLag,
            queueSize: this.queue.length
        };
    }
}

export const bpManager = new BackpressureManager();
