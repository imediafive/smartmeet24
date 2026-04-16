const ROOM_TTL_MS = 30 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 1000;

const roomCache = new Map();
const historyCache = new Map();

let hits = 0, misses = 0;

export function getCachedRoom(roomId) {
    const entry = roomCache.get(roomId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { roomCache.delete(roomId); return null; }
    entry.expiresAt = Date.now() + ROOM_TTL_MS;
    return entry;
}

export function setCachedRoom(meeting) {
    roomCache.set(meeting.roomId, {
        hostId: meeting.hostId,
        hostSocketId: meeting.hostSocketId,
        status: meeting.status,
        participants: meeting.participants || [], // Always store as Array
        expiresAt: Date.now() + ROOM_TTL_MS,
    });
}


export function patchCachedRoom(roomId, patch) {
    const entry = roomCache.get(roomId);
    if (!entry) return;
    Object.assign(entry, patch);
    entry.expiresAt = Date.now() + ROOM_TTL_MS;
}

export function patchCachedParticipant(roomId, userId, patch) {
    const entry = roomCache.get(roomId);
    if (!entry || !entry.participants) return;
    const idx = entry.participants.findIndex(p => String(p.userId) === String(userId));
    if (idx > -1) {
        entry.participants[idx] = { ...entry.participants[idx], ...patch };
    } else {
        entry.participants.push({ userId, ...patch });
    }
    entry.expiresAt = Date.now() + ROOM_TTL_MS;
}

export function evictRoom(roomId) {
    roomCache.delete(roomId);
}

export function getCachedHistory(userId) {
    const entry = historyCache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { historyCache.delete(userId); return null; }
    return entry.data;
}

export function setCachedHistory(userId, data) {
    historyCache.set(userId, { data, expiresAt: Date.now() + HISTORY_TTL_MS });
}

export function invalidateHistory(userId) {
    historyCache.delete(userId);
}

export function invalidateAllHistory() {
    historyCache.clear();
}

export function recordHit() { hits++; }
export function recordMiss() { misses++; }
export function getCacheStats() {
    return { roomCacheSize: roomCache.size, historyCacheSize: historyCache.size, hits, misses };
}

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of roomCache.entries()) if (now > v.expiresAt) roomCache.delete(k);
    for (const [k, v] of historyCache.entries()) if (now > v.expiresAt) historyCache.delete(k);
}, 5 * 60 * 1000);
