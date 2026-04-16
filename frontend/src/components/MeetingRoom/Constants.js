export const REACTIONS = [
    { key: 'heart', icon: '❤️', color: 'text-red-500' },
    { key: 'thumbsup', icon: '👍', color: 'text-blue-500' },
    { key: 'laugh', icon: '😂', color: 'text-yellow-500' },
    { key: 'sad', icon: '😢', color: 'text-blue-400' },
    { key: 'fire', icon: '🔥', color: 'text-orange-500' },
    { key: 'rocket', icon: '🚀', color: 'text-purple-500' },
    { key: 'check', icon: '✅', color: 'text-green-500' }
];

export const reactionByKey = REACTIONS.reduce((acc, r) => ({ ...acc, [r.key]: r }), {});
