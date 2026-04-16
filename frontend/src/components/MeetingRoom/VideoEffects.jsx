import React from 'react';
import { Sparkles, X, Sun, Contrast, Droplets, Palette, Ghost } from 'lucide-react';
import { cn } from '../../utils';

const FILTERS = [
    { id: 'none', label: 'None', icon: X, style: 'none' },
    { id: 'beauty', label: 'Beauty', icon: Sparkles, style: 'beauty' },
    { id: 'vibrant', label: 'Vibrant', icon: Sun, style: 'vibrant' },
    { id: 'dramatic', label: 'Dramatic', icon: Contrast, style: 'dramatic' },
    { id: 'bw', label: 'B&W', icon: Droplets, style: 'bw' },
    { id: 'classic', label: 'Classic', icon: Palette, style: 'classic' },
    { id: 'ghost', label: 'Ghost', icon: Ghost, style: 'ghost' },
];

const VideoEffects = ({ activeFilter, onSelect, onClose }) => {
    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="m-0 text-base font-black tracking-tight flex items-center gap-2">
                    <Sparkles size={16} className="text-premium-accent" />
                    VIDEO EFFECTS
                </h3>
                <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors border-none cursor-pointer text-gray-400"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
                <div className="grid grid-cols-2 gap-3">
                    {FILTERS.map((f) => {
                        const Icon = f.icon;
                        const isActive = activeFilter === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => onSelect(f.id)}
                                className={cn(
                                    "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all gap-2 active:scale-95",
                                    isActive
                                        ? "bg-black border-black text-white shadow-xl shadow-black/10"
                                        : "bg-gray-50 border-gray-100 text-gray-600 hover:border-gray-200"
                                )}
                            >
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center",
                                    isActive ? "bg-white/10" : "bg-white"
                                )}>
                                    <Icon size={20} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest">{f.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export { FILTERS };
export default VideoEffects;
