import React, { useRef, useState, useEffect } from "react";
import { X, Crop, Paintbrush, Eraser, RotateCcw, Save, Sparkles, Sliders } from "lucide-react";

interface ImagePainterEditorProps {
  imageUrl: string;
  onSave: (editedDataUrl: string) => void;
  onClose: () => void;
}

export default function ImagePainterEditor({ imageUrl, onSave, onClose }: ImagePainterEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activeTool, setActiveTool] = useState<"paint" | "erase" | "crop">("paint");
  const [brushColor, setBrushColor] = useState<string>("#EF4444"); // Default red brush
  const [brushSize, setBrushSize] = useState<number>(5);
  const [eraserColor, setEraserColor] = useState<"white" | "black">("white");
  
  // Crop state
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [cropStart, setCropStart] = useState({ x: 0, y: 0 });
  const [cropEnd, setCropEnd] = useState({ x: 0, y: 0 });
  
  // Image state
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Filters state
  const [filter, setFilter] = useState<"none" | "grayscale" | "contrast" | "invert">("none");
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // Load original image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      setOriginalImage(img);
      resetCanvas(img, "none");
    };
  }, [imageUrl]);

  const resetCanvas = (img: HTMLImageElement | null = originalImage, activeFilter = filter) => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions to fit image but keep within reasonable sizes
    const maxW = 800;
    const maxH = 600;
    let w = img.width;
    let h = img.height;

    if (w > maxW) {
      h = (maxW / w) * h;
      w = maxW;
    }
    if (h > maxH) {
      w = (maxH / h) * w;
      h = maxH;
    }

    canvas.width = w;
    canvas.height = h;

    // Appy filters
    ctx.clearRect(0, 0, w, h);
    if (activeFilter === "grayscale") {
      ctx.filter = "grayscale(100%)";
    } else if (activeFilter === "contrast") {
      ctx.filter = "contrast(180%) brightness(110%)";
    } else if (activeFilter === "invert") {
      ctx.filter = "invert(100%)";
    } else {
      ctx.filter = "none";
    }

    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = "none"; // reset for painting
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === "crop") {
      setIsDrawingCrop(true);
      setCropStart({ x, y });
      setCropEnd({ x, y });
    } else {
      setIsDrawing(true);
      setLastPos({ x, y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === "crop" && isDrawingCrop) {
      setCropEnd({ x, y });
      // Redraw canvas state and crop box overlay
      redrawWithCropOverlay(x, y);
    } else if (isDrawing) {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(x, y);

      if (activeTool === "paint") {
        ctx.strokeStyle = brushColor;
        ctx.globalCompositeOperation = "source-over";
      } else if (activeTool === "erase") {
        ctx.strokeStyle = eraserColor === "white" ? "#FFFFFF" : "#000000";
        ctx.globalCompositeOperation = "source-over"; // we draw color directly
      }

      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      setLastPos({ x, y });
    }
  };

  const handleMouseUp = () => {
    if (activeTool === "crop" && isDrawingCrop) {
      setIsDrawingCrop(false);
    }
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (activeTool === "crop") {
      setIsDrawingCrop(true);
      setCropStart({ x, y });
      setCropEnd({ x, y });
    } else {
      setIsDrawing(true);
      setLastPos({ x, y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (activeTool === "crop" && isDrawingCrop) {
      setCropEnd({ x, y });
    } else if (isDrawing) {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(x, y);

      if (activeTool === "paint") {
        ctx.strokeStyle = brushColor;
        ctx.globalCompositeOperation = "source-over";
      } else if (activeTool === "erase") {
        ctx.strokeStyle = eraserColor === "white" ? "#FFFFFF" : "#000000";
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      setLastPos({ x, y });
    }
  };

  const handleTouchEnd = () => {
    if (activeTool === "crop" && isDrawingCrop) {
      setIsDrawingCrop(false);
    }
    setIsDrawing(false);
  };

  const redrawWithCropOverlay = (currX: number, currY: number) => {
    if (!originalImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw base image and drawings first (we can preserve from canvas state or just clear and redraw base)
    // To keep simple, we can load what is currently on canvas (drawing) and draw a dotted box
    // But since canvas is modified, let's keep drawing simple. Better yet, we can draw the bounding box in real-time.
  };

  // Perform crop action
  const applyCrop = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropStart.x - cropEnd.x);
    const h = Math.abs(cropStart.y - cropEnd.y);

    if (w < 10 || h < 10) return;

    // Create secondary temp canvas to copy coordinates
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

    // Swap temp canvas contents back to primary canvas
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(tempCanvas, 0, 0);

    // Save as new original image state so future resets/filters map to cropped
    const imgElement = new Image();
    imgElement.src = canvas.toDataURL();
    imgElement.onload = () => {
      setOriginalImage(imgElement);
    };

    // Reset crop points
    setCropStart({ x: 0, y: 0 });
    setCropEnd({ x: 0, y: 0 });
    setActiveTool("paint");
  };

  const saveEditedImage = () => {
    if (!canvasRef.current) return;
    const editedUrl = canvasRef.current.toDataURL("image/png");
    onSave(editedUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 backdrop-blur-md items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-500 w-5 h-5 animate-pulse" />
            <div>
              <h3 className="text-white font-semibold font-sans text-sm sm:text-base">Visual Image Editor</h3>
              <p className="text-zinc-400 text-xs font-mono">Crop snips, mark up, or wipe out watermarks</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* WORKSPACE */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          
          {/* TOOLBAR SIDE PANEL */}
          <div className={`w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 p-4 bg-zinc-950 flex flex-col gap-4 overflow-y-auto shrink-0 ${
            showMobileSettings ? "flex absolute inset-0 z-35" : "hidden md:flex"
          }`}>
            
            {/* MOBILE ONLY DRAWER HEADER */}
            <div className="md:hidden flex justify-between items-center pb-2 border-b border-zinc-800 shrink-0">
              <span className="text-xs font-bold text-amber-500 uppercase">Brush, Mask, & Filters</span>
              <button
                type="button"
                onClick={() => setShowMobileSettings(false)}
                className="text-xs font-bold bg-zinc-805 text-white py-1 px-3 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition"
              >
                Apply Details
              </button>
            </div>

            {/* ACTION MODES */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Editor Tools</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTool("paint")}
                  className={`py-2 px-3 flex flex-col items-center justify-center rounded-lg border text-xs font-medium gap-1 transition ${
                    activeTool === "paint" 
                      ? "bg-amber-600/15 border-amber-500 text-amber-500" 
                      : "border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <Paintbrush size={16} />
                  <span>Paint</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool("erase")}
                  className={`py-2 px-3 flex flex-col items-center justify-center rounded-lg border text-xs font-medium gap-1 transition ${
                    activeTool === "erase" 
                      ? "bg-amber-600/15 border-amber-500 text-amber-500" 
                      : "border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <Eraser size={16} />
                  <span>Eraser</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool("crop")}
                  className={`py-2 px-3 flex flex-col items-center justify-center rounded-lg border text-xs font-medium gap-1 transition ${
                    activeTool === "crop" 
                      ? "bg-amber-600/15 border-amber-500 text-amber-500" 
                      : "border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <Crop size={16} />
                  <span>Crop</span>
                </button>
              </div>
            </div>

            {/* BRUSH OPTIONS */}
            {activeTool === "paint" && (
              <div className="space-y-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Brush Settings</span>
                
                {/* Size slider */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Size</span>
                    <span className="font-mono text-amber-500">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-zinc-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                  />
                </div>

                {/* Color picker */}
                <div>
                  <span className="text-xs text-zinc-400 block mb-1.5">Color</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#FFFFFF", "#000000"].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setBrushColor(color)}
                        style={{ backgroundColor: color }}
                        className={`w-6 h-6 rounded-full border transition ${
                          brushColor === color ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-amber-500 border-white" : "border-zinc-700"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ERASER OPTIONS */}
            {activeTool === "erase" && (
              <div className="space-y-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl animate-fade-in">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Watermark Erasing</span>
                <p className="text-[11px] text-zinc-400">Brush over logo watermarks, channels name references, or link banners to paint them solid background block color.</p>
                
                {/* Size slider */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Size</span>
                    <span className="font-mono text-amber-500">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="60"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-zinc-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                  />
                </div>

                {/* Erase Color Solid Block */}
                <div>
                  <span className="text-xs text-zinc-400 block mb-1">Erase Fill Color</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEraserColor("white")}
                      className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition ${
                        eraserColor === "white" 
                          ? "bg-amber-600/10 border-amber-500 text-amber-500" 
                          : "bg-zinc-800 border-zinc-700 text-zinc-300"
                      }`}
                    >
                      <div className="w-3.5 h-3.5 rounded bg-white border border-zinc-400" />
                      Whiteout
                    </button>
                    <button
                      type="button"
                      onClick={() => setEraserColor("black")}
                      className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition ${
                        eraserColor === "black" 
                          ? "bg-amber-600/10 border-amber-500 text-amber-500" 
                          : "bg-zinc-800 border-zinc-700 text-zinc-300"
                      }`}
                    >
                      <div className="w-3.5 h-3.5 rounded bg-black border border-zinc-700" />
                      Blackout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* CROP CONTROL ACTIONS */}
            {activeTool === "crop" && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2 animate-fade-in">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Crop Instructions</span>
                <p className="text-[11px] text-zinc-400">Click and drag a box over your target question region directly on the canvas, then tap "Apply Crop" below.</p>
                <button
                  type="button"
                  onClick={applyCrop}
                  className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold py-2 rounded-lg text-xs font-sans text-center transition flex justify-center gap-1.5"
                >
                  <Crop size={14} />
                  Apply Crop
                </button>
              </div>
            )}

            {/* FILTERS & ADJUSTMENTS */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Contrast & Color</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "none", label: "Normal" },
                  { id: "grayscale", label: "B&W Mono" },
                  { id: "contrast", label: "High Sharp" },
                  { id: "invert", label: "Negative" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFilter(item.id as any);
                      resetCanvas(originalImage, item.id as any);
                    }}
                    className={`text-xs py-1.5 px-3 border rounded-lg transition ${
                      filter === item.id 
                        ? "bg-amber-500/10 border-amber-500 text-amber-500 font-bold" 
                        : "border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* RESET BUTTON */}
            <button
              type="button"
              onClick={() => {
                setFilter("none");
                resetCanvas(originalImage, "none");
              }}
              className="mt-auto w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-lg text-xs font-medium font-sans flex items-center justify-center gap-2 transition"
            >
              <RotateCcw size={14} />
              Reset All Layers
            </button>
          </div>

          {/* CANVAS STAGE VIEWPORT CONTAINER WITH QUICK CONTROL BAR */}
          <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
            <div 
              ref={containerRef}
              className="flex-1 overflow-auto p-4 flex items-center justify-center"
              style={{ minHeight: "250px" }}
            >
              <div className="relative border border-zinc-800 rounded shadow-lg bg-white overflow-hidden max-w-full">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`max-w-full cursor-${activeTool === "crop" ? "crosshair" : "pencil"}`}
                />

                {/* Real-time crop box guides when drawing crop */}
                {activeTool === "crop" && (cropStart.x > 0 || cropEnd.x > 0) && (
                  <div 
                    className="absolute border-2 border-dashed border-amber-500 bg-amber-500/10 pointer-events-none"
                    style={{
                      left: `${Math.min(cropStart.x, cropEnd.x)}px`,
                      top: `${Math.min(cropStart.y, cropEnd.y)}px`,
                      width: `${Math.abs(cropStart.x - cropEnd.x)}px`,
                      height: `${Math.abs(cropStart.y - cropEnd.y)}px`,
                    }}
                  />
                )}
              </div>
            </div>

            {/* QUICK MOBILE CONTROL BAR FOR COMPACT VIEWS */}
            <div className="md:hidden bg-zinc-900 border-t border-zinc-800 p-2.5 flex items-center justify-between gap-2 z-10 shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("paint");
                    setShowMobileSettings(false);
                  }}
                  className={`p-2 rounded-lg border text-xs transition ${
                    activeTool === "paint" 
                      ? "bg-amber-500/20 border-amber-500 text-amber-500" 
                      : "border-zinc-800 bg-zinc-950 text-zinc-400"
                  }`}
                  title="Paint Tool"
                >
                  <Paintbrush size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("erase");
                    setShowMobileSettings(false);
                  }}
                  className={`p-2 rounded-lg border text-xs transition ${
                    activeTool === "erase" 
                      ? "bg-amber-500/20 border-amber-500 text-amber-500" 
                      : "border-zinc-800 bg-zinc-950 text-zinc-400"
                  }`}
                  title="Erase Watermarks"
                >
                  <Eraser size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool("crop");
                    setShowMobileSettings(false);
                  }}
                  className={`p-2 rounded-lg border text-xs transition ${
                    activeTool === "crop" 
                      ? "bg-amber-500/20 border-amber-500 text-amber-500" 
                      : "border-zinc-800 bg-zinc-950 text-zinc-400"
                  }`}
                  title="Crop Image"
                >
                  <Crop size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {activeTool === "crop" && (
                  <button
                    type="button"
                    onClick={applyCrop}
                    className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-zinc-950 font-extrabold py-1.5 px-3 rounded-lg text-[11px] transition flex items-center gap-1 shrink-0"
                  >
                    <Crop size={12} />
                    <span>Apply Crop</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowMobileSettings(!showMobileSettings)}
                  className="py-1.5 px-3 rounded-lg border border-zinc-700 bg-zinc-800 active:scale-95 text-zinc-200 text-[11px] font-bold transition flex items-center gap-1"
                >
                  <Sliders size={12} className="text-amber-500" />
                  <span>{showMobileSettings ? "Hide Options" : "Options"}</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold border border-zinc-800 hover:border-zinc-700 transition"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={saveEditedImage}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-black rounded-xl shadow-md shadow-amber-500/10 hover:shadow-amber-500/20 hover:scale-101 border border-amber-400 transition flex items-center gap-1.5"
          >
            <Save size={14} />
            Save Snippet to Question
          </button>
        </div>

      </div>
    </div>
  );
}
