import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Minus, Pen, Eraser, RotateCcw, Trash2, Download, Square, Circle, Minus as Line } from 'lucide-react';
import { cn } from '../../utils';
import { useAuthContext } from '../../AuthContext';


const COLORS = ['#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ffffff'];
const SIZES = [2, 5, 10, 18];
const TOOLS = [
    { id: 'pen', label: 'Pen', icon: Pen },
    { id: 'eraser', label: 'Eraser', icon: Eraser },
    { id: 'line', label: 'Line', icon: Line },
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'circle', label: 'Circle', icon: Circle },
];

const Whiteboard = ({ roomId, onClose, isHost, onDraw, onClear, drawData }) => {

    const { user, getToken } = useAuthContext();
    const canvasRef = useRef(null);
    const overlayRef = useRef(null); // for shape preview
    const isDrawing = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const history = useRef([]);
    const historyIndex = useRef(-1);

    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#1a1a1a');
    const [size, setSize] = useState(5);
    const bgColor = '#ffffff';

    const userIdRef = useRef(user?.id || user?._id || 'unknown');
    useEffect(() => { userIdRef.current = user?.id || user?._id || 'unknown'; }, [user?.id, user?._id]);

    // Real-time broadcast helper
    const broadcast = useCallback(async (data) => {
        if (onDraw) onDraw(data);
    }, [onDraw]);


    // Handle incoming drawing data
    const handleRemoteDraw = useCallback((data) => {
        const myId = String(userIdRef.current);
        const remoteId = String(data.senderId || '');
        if (remoteId === myId) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (data.type === 'clear') {
            ctx.fillStyle = data.bgColor || '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }

        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (data.type === 'pen') {
            ctx.beginPath();
            ctx.moveTo(data.from.x, data.from.y);
            ctx.lineTo(data.to.x, data.to.y);
            ctx.stroke();
        } else if (data.type === 'eraser') {
            ctx.clearRect(data.pos.x - data.size * 2, data.pos.y - data.size * 2, data.size * 4, data.size * 4);
        } else if (data.type === 'shape') {
            ctx.fillStyle = data.color + '20';
            const { sx, sy, w, h } = data;
            if (data.tool === 'line') {
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + w, sy + h);
                ctx.stroke();
            } else if (data.tool === 'rect') {
                ctx.beginPath();
                ctx.rect(sx, sy, w, h);
                ctx.fill();
                ctx.stroke();
            } else if (data.tool === 'circle') {
                const rx = Math.abs(w) / 2;
                const ry = Math.abs(h) / 2;
                ctx.beginPath();
                ctx.ellipse(sx + w / 2, sy + h / 2, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
    }, [user?.id, user?._id]);

    useEffect(() => {
        if (drawData) handleRemoteDraw(drawData);
    }, [drawData, handleRemoteDraw]);


    // Resize canvas to fill container
    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;

        const resize = () => {
            const parent = canvas.parentElement;
            const w = parent.clientWidth;
            const h = parent.clientHeight;

            // Save current drawing if dimensions are valid
            let imageData = null;
            if (canvas.width > 0 && canvas.height > 0) {
                imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            }

            canvas.width = w;
            canvas.height = h;
            overlay.width = w;
            overlay.height = h;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, w, h);
            if (imageData && imageData.width > 0 && imageData.height > 0) {
                ctx.putImageData(imageData, 0, 0);
            }
        };

        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [bgColor]);

    const saveToHistory = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL();
        history.current = history.current.slice(0, historyIndex.current + 1);
        history.current.push(dataUrl);
        historyIndex.current = history.current.length - 1;
    }, []);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    };

    const lastPos = useRef(null);

    const startDraw = useCallback((e) => {
        e.preventDefault();
        const pos = getPos(e);
        isDrawing.current = true;
        startPos.current = pos;
        lastPos.current = pos;

        if (tool === 'pen' || tool === 'eraser') {
            saveToHistory();
            const ctx = canvasRef.current.getContext('2d');
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }
    }, [tool, saveToHistory]);

    const draw = useCallback((e) => {
        e.preventDefault();
        if (!isDrawing.current) return;
        const pos = getPos(e);

        if (tool === 'pen') {
            const ctx = canvasRef.current.getContext('2d');
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Broadcast line segment
            broadcast({ type: 'pen', from: lastPos.current, to: pos, color, size });
            lastPos.current = pos;
        } else if (tool === 'eraser') {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(pos.x - size * 2, pos.y - size * 2, size * 4, size * 4);
            broadcast({ type: 'eraser', pos, size });
        } else {
            // Shape preview on overlay canvas
            const overlay = overlayRef.current;
            const oc = overlay.getContext('2d');
            oc.clearRect(0, 0, overlay.width, overlay.height);
            oc.strokeStyle = color;
            oc.fillStyle = color + '20';
            oc.lineWidth = size;
            oc.lineCap = 'round';
            oc.lineJoin = 'round';

            const { x: sx, y: sy } = startPos.current;
            const w = pos.x - sx;
            const h = pos.y - sy;

            if (tool === 'line') {
                oc.beginPath();
                oc.moveTo(sx, sy);
                oc.lineTo(pos.x, pos.y);
                oc.stroke();
            } else if (tool === 'rect') {
                oc.beginPath();
                oc.rect(sx, sy, w, h);
                oc.fill();
                oc.stroke();
            } else if (tool === 'circle') {
                const rx = Math.abs(w) / 2;
                const ry = Math.abs(h) / 2;
                oc.beginPath();
                oc.ellipse(sx + w / 2, sy + h / 2, rx, ry, 0, 0, Math.PI * 2);
                oc.fill();
                oc.stroke();
            }
        }
    }, [tool, color, size, broadcast]);

    const endDraw = useCallback((e) => {
        if (!isDrawing.current) return;
        isDrawing.current = false;

        if (tool !== 'pen' && tool !== 'eraser') {
            const pos = getPos(e);
            saveToHistory();
            // Commit the overlay to the main canvas
            const ctx = canvasRef.current.getContext('2d');
            ctx.drawImage(overlayRef.current, 0, 0);

            // Broadcast shape completion
            const { x: sx, y: sy } = startPos.current;
            broadcast({
                type: 'shape',
                tool,
                sx,
                sy,
                w: pos.x - sx,
                h: pos.y - sy,
                color,
                size
            });

            // Clear overlay
            overlayRef.current.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
        }
        lastPos.current = null;
    }, [tool, color, size, saveToHistory, broadcast]);

    const undo = useCallback(() => {
        if (historyIndex.current <= 0) {
            // Clear to background
            const ctx = canvasRef.current.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            historyIndex.current = -1;
            history.current = [];
            // Note: syncing undo is complex with many users, skipping for now
            return;
        }
        historyIndex.current -= 1;
        const img = new Image();
        img.src = history.current[historyIndex.current];
        img.onload = () => {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(img, 0, 0);
        };
    }, [bgColor]);

    const clearCanvas = useCallback(() => {
        saveToHistory();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (onClear) onClear({ type: 'clear', bgColor });
    }, [bgColor, saveToHistory, onClear]);



    const downloadCanvas = useCallback(() => {
        const link = document.createElement('a');
        link.download = `whiteboard-${Date.now()}.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    }, []);

    return (
        <div className="absolute inset-0 z-[5] flex flex-col bg-gray-100">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-2 sm:px-4 py-2 bg-white border-b border-gray-200 shadow-sm overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-xs font-black uppercase tracking-widest text-gray-400 mr-1">Whiteboard</span>

                    {/* Tools */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {TOOLS.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                title={label}
                                onClick={() => setTool(id)}
                                className={cn(
                                    'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all border-none cursor-pointer',
                                    tool === id ? 'bg-black text-white shadow' : 'bg-transparent text-gray-600 hover:bg-gray-200'
                                )}
                            >
                                <Icon size={14} />
                            </button>
                        ))}
                    </div>

                    {/* Sizes */}
                    <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {SIZES.map(s => (
                            <button
                                key={s}
                                onClick={() => setSize(s)}
                                className={cn(
                                    'w-8 h-8 rounded-lg flex items-center justify-center transition-all border-none cursor-pointer',
                                    size === s ? 'bg-black text-white shadow' : 'bg-transparent text-gray-500 hover:bg-gray-200'
                                )}
                            >
                                <div
                                    className="rounded-full bg-current"
                                    style={{ width: Math.min(s * 1.5, 18), height: Math.min(s * 1.5, 18) }}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Colors */}
                    <div className="flex items-center gap-1 sm:gap-1.5 ml-1">
                        {COLORS.slice(0, window.innerWidth < 640 ? 5 : undefined).map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                style={{ backgroundColor: c }}
                                className={cn(
                                    'w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all cursor-pointer',
                                    color === c ? 'border-blue-500 scale-125 shadow-md' : 'border-gray-300 hover:scale-110'
                                )}
                            />
                        ))}
                    </div>
                </div>


                {/* Actions */}
                <div className="ml-auto flex items-center gap-1">
                    <button
                        onClick={undo}
                        title="Undo"
                        className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all border-none cursor-pointer"
                    >
                        <RotateCcw size={14} />
                    </button>
                    <button
                        onClick={clearCanvas}
                        title="Clear"
                        className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-all border-none cursor-pointer"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        onClick={downloadCanvas}
                        title="Download"
                        className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-all border-none cursor-pointer"
                    >
                        <Download size={14} />
                    </button>
                    {(isHost || true) && (
                        <button
                            onClick={onClose}
                            title="Close"
                            className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-black hover:text-white text-gray-700 flex items-center justify-center transition-all border-none cursor-pointer ml-2"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Canvas area */}
            <div className="flex-1 relative overflow-hidden" style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}>
                {/* Main canvas */}
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                    style={{ touchAction: 'none' }}
                />
                {/* Overlay canvas for shape previews */}
                <canvas
                    ref={overlayRef}
                    className="absolute inset-0 pointer-events-none"
                />
            </div>
        </div>
    );
};

export default Whiteboard;
