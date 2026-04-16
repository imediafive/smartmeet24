import React from 'react';
import { motion } from 'framer-motion';
import { BarChart2, CheckCircle2 } from 'lucide-react';
import { cn } from '../../utils';

const PollItem = ({ poll, onVote, userId, isHost, onClose }) => {
    const totalVotes = poll.options.reduce((acc, opt) => acc + opt.votes.length, 0);
    const hasVoted = poll.options.some(opt => opt.votes.includes(userId));
    const isOwner = String(poll.creatorId) === String(userId);
    const isClosed = poll.status === 'closed';

    return (
        <div className={cn(
            "w-full bg-white border rounded-[2rem] p-6 flex flex-col gap-4 transition-all animate-in fade-in slide-in-from-bottom-4 duration-500",
            isClosed ? "border-gray-100 shadow-sm" : "border-premium-accent/20 shadow-2xl shadow-premium-accent/5 ring-1 ring-premium-accent/5"
        )}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center",
                        isClosed ? "bg-gray-100 text-gray-400" : "bg-premium-accent/10 text-premium-accent"
                    )}>
                        <BarChart2 size={14} />
                    </div>
                    <span className={cn(
                        "text-[10px] font-black uppercase tracking-[0.2em]",
                        isClosed ? "text-gray-400" : "text-premium-accent"
                    )}>
                        {isClosed ? 'Final Results' : 'Active Poll'}
                    </span>
                </div>
                {!isClosed && (isHost || isOwner) && (
                    <button 
                        onClick={() => onClose?.(poll.id)}
                        className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-black uppercase tracking-widest transition-all border-none cursor-pointer active:scale-95"
                    >
                        End Poll
                    </button>
                )}
            </div>
            
            <h4 className="text-[15px] font-black text-gray-900 m-0 leading-snug tracking-tight">{poll.question}</h4>
            
            <div className="flex flex-col gap-3 mt-1">
                {poll.options.map((opt, idx) => {
                    const count = opt.votes.length;
                    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isMyVote = opt.votes.includes(userId);
                    const showProgress = hasVoted || isClosed;

                    return (
                        <button
                            key={idx}
                            disabled={showProgress || isClosed}
                            onClick={() => onVote(poll.id, idx)}
                            className={cn(
                                "group relative w-full p-4 rounded-2xl border transition-all overflow-hidden",
                                showProgress 
                                    ? "bg-gray-50/50 border-gray-100 cursor-default" 
                                    : "bg-white border-gray-200 hover:border-black hover:bg-gray-50 cursor-pointer active:scale-[0.98]",
                                isMyVote && "border-black ring-4 ring-black/5"
                            )}
                        >
                            {/* Progress bar */}
                            {showProgress && (
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percent}%` }}
                                    className={cn("absolute inset-0 transition-opacity", isMyVote ? "bg-black/5" : "bg-black/5")}
                                />
                            )}

                            <div className="relative flex items-center justify-between z-10">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                        isMyVote ? "bg-black border-black text-white" : "border-gray-200 bg-white"
                                    )}>
                                        {isMyVote && <CheckCircle2 size={10} />}
                                    </div>
                                    <span className={cn("text-xs font-black uppercase tracking-tight", isMyVote ? "text-black" : "text-gray-600")}>
                                        {opt.text}
                                    </span>
                                </div>
                                {showProgress && (
                                    <span className="text-[11px] font-black text-black">{percent}%</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">By {poll.creatorName}</span>
                <div className="flex items-center gap-1.5 opacity-40">
                    <span className="text-[9px] font-black text-black uppercase tracking-widest">{totalVotes} {totalVotes === 1 ? 'Submission' : 'Submissions'}</span>
                </div>
            </div>
        </div>
    );
};

export default PollItem;
