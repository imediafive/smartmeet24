import React, { useState } from 'react';
import { X, Plus, Trash2, PieChart } from 'lucide-react';
import { cn } from '../../utils';

const CreatePoll = ({ onCreate, onCancel }) => {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);

    const addOption = () => {
        if (options.length < 5) setOptions([...options, '']);
    };

    const removeOption = (idx) => {
        if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
    };

    const updateOption = (idx, val) => {
        const next = [...options];
        next[idx] = val;
        setOptions(next);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const validOptions = options.filter(o => o.trim());
        if (question.trim() && validOptions.length >= 2) {
            onCreate({ question: question.trim(), options: validOptions });
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="m-0 text-base font-black tracking-tight flex items-center gap-2">
                    <PieChart size={16} className="text-black" />
                    CREATE NEW POLL
                </h3>
                <button
                    onClick={onCancel}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors border-none cursor-pointer text-gray-400"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 block">Question</label>
                    <textarea
                        autoFocus
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="What would you like to ask?"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-medium outline-none focus:border-black transition-all resize-none h-24"
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 block">Options</label>
                    {options.map((opt, idx) => (
                        <div key={idx} className="flex gap-2 group">
                            <input
                                value={opt}
                                onChange={e => updateOption(idx, e.target.value)}
                                placeholder={`Option ${idx + 1}`}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-all"
                            />
                            {options.length > 2 && (
                                <button
                                    onClick={() => removeOption(idx)}
                                    className="p-3 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}

                    {options.length < 5 && (
                        <button
                            onClick={addOption}
                            className="w-full py-3 border-2 border-dashed border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:border-black/10 hover:text-black transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={14} /> Add Option
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 shrink-0">
                <button
                    onClick={handleSubmit}
                    disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
                    className="w-full py-4 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-black/10 transition-all active:scale-95 disabled:grayscale disabled:opacity-30"
                >
                    Launch Poll
                </button>
            </div>
        </div>
    );
};

export default CreatePoll;
