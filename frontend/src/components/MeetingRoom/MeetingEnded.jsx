import React from 'react';
import { Home, Plus, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import PremiumButton from '../../PremiumButton';
import { useNavigate } from 'react-router-dom';

const MeetingEnded = ({ title, onHome, onNew }) => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white text-black text-center">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full"
            >
                <div className="mb-8 flex justify-center">
                    <div className="w-20 h-20 rounded-3xl bg-green-50 flex items-center justify-center text-green-500 shadow-xl shadow-green-100 ring-1 ring-green-100">
                        <CheckCircle2 size={40} />
                    </div>
                </div>

                <h1 className="text-4xl font-bold tracking-tight mb-4">Meeting Ended</h1>
                <p className="text-lg font-bold text-gray-500 mb-8 leading-relaxed">
                    The session <span className="text-black font-extrabold">"{title || 'Untitled'}"</span> has been successfully concluded. 
                    Recording assets and AI summaries are being processed.
                </p>

                <div className="flex flex-col gap-4">
                    <PremiumButton 
                        icon={Plus}
                        onClick={onNew}
                        className="h-14 font-bold"
                    >
                        Start New Meeting
                    </PremiumButton>
                    
                    <button 
                        onClick={onHome}
                        className="h-14 flex items-center justify-center gap-2 font-bold text-sm text-gray-400 hover:text-black transition-colors bg-transparent border-none cursor-pointer"
                    >
                        <Home size={16} /> Return to Dashboard
                    </button>
                </div>

                <div className="mt-12 pt-12 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-gray-300">
                        Powered by SmartMeet Enterprise
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default MeetingEnded;
