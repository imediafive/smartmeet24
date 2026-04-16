import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, BarChart2, PieChart } from 'lucide-react';
import { cn } from '../../utils';
import { useAuthContext } from '../../AuthContext';
import PollItem from './PollItem';
import CreatePoll from './CreatePoll';

const ChatPanel = ({ messages, onSend, onClose, participants = [], onCreatePoll, onVotePoll }) => {
    const { user } = useAuthContext();
    const [t, setT] = useState('');
    const [recipient, setRecipient] = useState('all'); // 'all' or specific userId
    const [mode, setMode] = useState('chat'); // 'chat' or 'create-poll'
    const scrollRef = useRef();

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = (e) => {
        e.preventDefault();
        if (t.trim()) {
            onSend(t, recipient);
            setT('');
        }
    };

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="m-0 text-base font-black tracking-tight flex items-center gap-2">
                    {mode === 'chat' ? <MessageSquare size={16} className="text-black" /> : <PieChart size={16} className="text-black" />}
                    {mode === 'chat' ? 'MEETING CHAT' : 'NEW POLL'}
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMode(mode === 'chat' ? 'create-poll' : 'chat')}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors border-none cursor-pointer text-gray-400 hover:text-black"
                        title="Create Poll"
                    >
                        <BarChart2 size={18} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors border-none cursor-pointer text-gray-400 hover:text-black"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-none bg-[#fafafa]">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-4">
                        <MessageSquare size={48} />
                        <p className="text-[10px] font-black uppercase tracking-[.2em]">Start the conversation</p>
                    </div>
                ) : messages.map((m, i) => {
                    if (m.type === 'poll') {
                         return (
                            <div key={m.id || i} className="w-full flex justify-center py-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="w-full max-w-[95%]">
                                    <PollItem 
                                        poll={m.poll} 
                                        userId={user?.id} 
                                        onVote={(pid, idx) => onVotePoll({ pollId: pid, optionIndex: idx })}
                                        isHost={participants.some(p => String(p.id) === String(user?.id) && p.isHost)}
                                        onClose={(pid) => onVotePoll({ pollId: pid, action: 'close' })}
                                    />
                                </div>
                            </div>
                         );
                    }

                    const isMe = String(m.from) === String(user?.id) || m.from === 'me';
                    const isPrivate = m.isPrivate || (m.recipientId && m.recipientId !== 'all');
                    
                    return (
                        <div key={m.id || i} className={cn(
                            "flex flex-col gap-1",
                            isMe ? "items-end" : "items-start"
                        )}>
                            <div className="flex items-baseline gap-2 ml-1">
                                {!isMe ? (
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                                        {m.userName}
                                    </span>
                                ) : (
                                    isPrivate && (
                                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                                            To: {m.recipientName || participants.find(p => String(p.id) === String(m.recipientId))?.userName || 'Participant'}
                                        </span>
                                    )
                                )}
                                {isPrivate && (
                                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                        Private
                                    </span>
                                )}
                            </div>
                            <div className={cn(
                                "px-4 py-2.5 rounded-2xl text-sm shadow-sm max-w-[85%] break-words leading-relaxed transition-all",
                                isMe
                                    ? (isPrivate ? "bg-blue-600 text-white rounded-tr-none" : "bg-black text-white rounded-tr-none")
                                    : (isPrivate ? "bg-blue-50 text-blue-900 border border-blue-100 rounded-tl-none" : "bg-gray-100 text-gray-900 border border-gray-200 rounded-tl-none")
                            )}>
                                {m.text}
                            </div>
                        </div>
                    );
                })}
            </div>

            {mode === 'chat' ? (
                <div className="p-4 bg-white border-t border-gray-100 shrink-0">
                    <div className="mb-3 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">To:</span>
                        <select 
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest cursor-pointer outline-none focus:text-black transition-colors"
                        >
                            <option value="all">Everyone</option>
                            {participants.map(p => (
                                <option key={p.id} value={p.id}>{p.userName || 'Participant'}</option>
                            ))}
                        </select>
                    </div>
                    <form onSubmit={handleSend} className="flex gap-2">
                        <input
                            autoFocus
                            value={t}
                            onChange={e => setT(e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all outline-none bg-gray-50 border border-gray-100 text-gray-900 focus:bg-white focus:border-black/10 placeholder:text-gray-400 shadow-inner"
                            placeholder={recipient === 'all' ? "Message everyone..." : "Send private message..."}
                        />
                        <button
                            type="submit"
                            disabled={!t.trim()}
                            className={cn(
                                "w-12 h-11 flex items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-30 disabled:grayscale border-none cursor-pointer shadow-lg",
                                recipient === 'all' ? "bg-black text-white shadow-black/20" : "bg-blue-600 text-white shadow-blue-600/20"
                            )}
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            ) : (
                <div className="absolute inset-x-0 bottom-0 top-[73px] z-50 animate-in slide-in-from-bottom duration-300">
                    <CreatePoll 
                        onCancel={() => setMode('chat')} 
                        onCreate={(pData) => {
                            onCreatePoll(pData);
                            setMode('chat');
                        }} 
                    />
                </div>
            )}
        </div>
    );
};

export default ChatPanel;
