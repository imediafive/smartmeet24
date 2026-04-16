import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, LogOut, Info, AlertCircle, X } from 'lucide-react';
import { cn } from '../../utils';

const NotificationList = memo(({ notifications, setNotifications }) => {
    return (
        <div className="fixed top-20 left-6 z-[2000] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {notifications.map(n => (
                    <motion.div
                        key={n.id}
                        initial={{ x: -100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -100, opacity: 0 }}
                        className="w-72 bg-white/90 backdrop-blur-xl border border-gray-100 rounded-2xl p-4 shadow-2xl flex items-start gap-3 pointer-events-auto"
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            n.type === 'join' ? "bg-green-100 text-green-600" :
                                n.type === 'leave' ? "bg-red-100 text-red-600" :
                                    n.type === 'alert' ? "bg-amber-100 text-amber-600" :
                                        "bg-blue-100 text-blue-600"
                        )}>
                            {n.type === 'join' ? <LogIn size={18} /> :
                                n.type === 'leave' ? <LogOut size={18} /> :
                                    n.type === 'alert' ? <AlertCircle size={18} /> :
                                        <Info size={18} />}
                        </div>
                        <div className="flex-1 min-w-0 mt-0.5">
                            <h4 className="text-xs font-black uppercase tracking-widest text-gray-900 truncate">{n.title}</h4>
                            <p className="text-[11px] font-bold text-gray-400 mt-1 line-clamp-2">{n.message}</p>
                        </div>
                        <button
                            onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
                            className="text-gray-300 hover:text-gray-900 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
});

export default NotificationList;
