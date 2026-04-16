import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils';
import { reactionByKey } from './Constants';

const FloatingReaction = ({ reactionKey, name, onDone }) => {
    useEffect(() => {
        const t = setTimeout(() => {
            onDone();
        }, 10200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const r = reactionByKey[reactionKey];
    if (!r) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.5 }}
            animate={{ 
                opacity: [0, 1, 1, 0], 
                y: -500, 
                scale: [0.5, 1.2, 1.2, 1] 
            }}
            transition={{ 
                duration: 10, 
                ease: 'linear',
                times: [0, 0.1, 0.9, 1]
            }}
            className="fixed bottom-32 right-[40px] z-[900] pointer-events-none text-center"
            style={{ right: `${Math.random() * 200 + 40}px` }}
        >
            <div className={cn("mb-1 p-3 rounded-full bg-black/40 backdrop-blur-sm shadow-2xl flex items-center justify-center")}>
                <span className="text-3xl leading-none">{r.icon}</span>
            </div>
            <div className="text-[10px] text-white bg-black/60 rounded-md px-2 py-0.5 font-bold uppercase tracking-wider">
                {(name || '').trim()}
            </div>
        </motion.div>
    );
};

export default FloatingReaction;
