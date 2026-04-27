import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Download, Upload, Sliders, Layers, MousePointer2, ZoomIn, ZoomOut, FileText, Info, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseGerber, parseDrill, BoundingBox, GerberPath, DrillHole } from './utils/parsers';
import { generateSTL } from './utils/stlExporter';

export default function App() {
  const [gerberData, setGerberData] = useState<{ traces: GerberPath[]; bbox: BoundingBox } | null>(null);
  const [profileData, setProfileData] = useState<{ traces: GerberPath[]; bbox: BoundingBox } | null>(null);
  const [drillData, setDrillData] = useState<DrillHole[]>([]);
  const [traceExpansion, setTraceExpansion] = useState(1);
  const [holeSizeScale, setHoleSizeScale] = useState(1);
  const [holeThreshold, setHoleThreshold] = useState(1.2);
  const [boardThickness, setBoardThickness] = useState(1.6);
  const [traceExtrusion, setTraceExtrusion] = useState(0.6);
  const [viewMode, setViewMode] = useState<'fit' | 'zoom'>('fit');
  
  const fileInputRefCopper = useRef<HTMLInputElement>(null);
  const fileInputRefProfile = useRef<HTMLInputElement>(null);
  const fileInputRefDrill = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'copper' | 'profile' | 'drill') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (type === 'copper') {
        setGerberData(parseGerber(content));
      } else if (type === 'profile') {
        setProfileData(parseGerber(content));
      } else {
        setDrillData(parseDrill(content));
      }
    };
    reader.readAsText(file);
  };

  const clearProject = () => {
    setGerberData(null);
    setProfileData(null);
    setDrillData([]);
    if (fileInputRefCopper.current) fileInputRefCopper.current.value = '';
    if (fileInputRefProfile.current) fileInputRefProfile.current.value = '';
    if (fileInputRefDrill.current) fileInputRefDrill.current.value = '';
  };

  const combinedBBox = useMemo(() => {
    const defaultBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    if (!gerberData && !profileData) return defaultBox;
    
    const boxes = [gerberData?.bbox, profileData?.bbox].filter(Boolean) as BoundingBox[];
    if (boxes.length === 0) return defaultBox;

    return {
      minX: Math.min(...boxes.map(b => b.minX)),
      minY: Math.min(...boxes.map(b => b.minY)),
      maxX: Math.max(...boxes.map(b => b.maxX)),
      maxY: Math.max(...boxes.map(b => b.maxY)),
    };
  }, [gerberData, profileData]);

  const pcbWidth = Math.max(10, combinedBBox.maxX - combinedBBox.minX);
  const pcbHeight = Math.max(10, combinedBBox.maxY - combinedBBox.minY);
  const padding = 10;

  // Log holes to console when drillData changes
  useEffect(() => {
    if (drillData.length > 0) {
      console.group('PCB Drill Hole Manifest');
      console.log(`Summary: ${drillData.length} holes detected.`);
      drillData.forEach((hole, index) => {
        console.log(
          `[%c#${String(index + 1).padStart(3, '0')}%c] ` +
          `X: %c${hole.x.toFixed(4)}%c mm, ` +
          `Y: %c${hole.y.toFixed(4)}%c mm, ` +
          `Radius: %c${(hole.size / 2).toFixed(4)}%c mm`,
          'color: #34d399; font-weight: bold', 'color: inherit',
          'color: #fb923c', 'color: inherit',
          'color: #fb923c', 'color: inherit',
          'color: #60a5fa', 'color: inherit'
        );
      });
      console.groupEnd();
    }
  }, [drillData]);

  return (
    <div className="flex h-screen relative overflow-hidden">
      <div className="mesh-gradient" />
      
      {/* Sidebar */}
      <aside className="w-80 h-full flex flex-col p-6 z-10 shrink-0">
        <div className="glass-panel h-full flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <span className="font-black text-white text-xl">T</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TapePCB</h1>
              <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">PCB to STL</p>
            </div>
          </div>

          <section className="space-y-6 flex-1">
            {/* File Upload Area */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest block">Layer Import</label>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => fileInputRefCopper.current?.click()}
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group"
                >
                  <div className="p-2 bg-orange-500/10 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                    <Layers className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold block leading-tight">Bottom</span>
                    <span className="text-[10px] text-white/40">Copper (.gbr)</span>
                  </div>
                </button>

                <button 
                  onClick={() => fileInputRefProfile.current?.click()}
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group"
                >
                  <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                    <MousePointer2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold block leading-tight">Profile Layer</span>
                    <span className="text-[10px] text-white/40">Outline/Milling (.gbr)</span>
                  </div>
                </button>

                <button 
                  onClick={() => fileInputRefDrill.current?.click()}
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group"
                >
                  <div className="p-2 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
                    <FileText className="w-4 h-4 text-white/60" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold block leading-tight">Drill Data</span>
                    <span className="text-[10px] text-white/40">Excellon (.drl)</span>
                  </div>
                </button>

                <input type="file" ref={fileInputRefCopper} className="hidden" accept=".gbr,.gerber" onChange={(e) => handleFileUpload(e, 'copper')} />
                <input type="file" ref={fileInputRefProfile} className="hidden" accept=".gbr,.gerber" onChange={(e) => handleFileUpload(e, 'profile')} />
                <input type="file" ref={fileInputRefDrill} className="hidden" accept=".drl,.drill" onChange={(e) => handleFileUpload(e, 'drill')} />
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-6 pt-6 border-t border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-4 h-4 text-white/40" />
                <h2 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Global Modifiers</h2>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                    <span className="text-white/60">Trace Expansion</span>
                    <span className="text-orange-400">x{traceExpansion.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="5" step="0.1" 
                    value={traceExpansion} 
                    onChange={(e) => setTraceExpansion(parseFloat(e.target.value))}
                    className="w-full accent-orange-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                    <span className="text-white/60">Hole Size Vector</span>
                    <span className="text-white">x{holeSizeScale.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="5" step="0.1" 
                    value={holeSizeScale} 
                    onChange={(e) => setHoleSizeScale(parseFloat(e.target.value))}
                    className="w-full accent-white h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                    <span className="text-white/60">Hole Threshold</span>
                    <span className="text-amber-400">&lt; {holeThreshold.toFixed(2)} mm</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="5" step="0.1" 
                    value={holeThreshold} 
                    onChange={(e) => setHoleThreshold(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[9px] text-white/30 uppercase tracking-tighter">Only holes smaller than this will be expanded</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                    <span className="text-white/60">Board Thickness</span>
                    <span className="text-emerald-400">{boardThickness.toFixed(1)} mm</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="5" step="0.1" 
                    value={boardThickness} 
                    onChange={(e) => setBoardThickness(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                    <span className="text-white/60">Trace Extrusion</span>
                    <span className="text-blue-400">{traceExtrusion.toFixed(1)} mm</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="2" step="0.1" 
                    value={traceExtrusion} 
                    onChange={(e) => setTraceExtrusion(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
              
              <div className="mt-8">
                <button
                  onClick={() => {
                    if (!gerberData) return;
                    generateSTL({
                      gerberTraces: gerberData.traces,
                      profileTraces: profileData?.traces,
                      drillHoles: drillData,
                      bbox: combinedBBox,
                      thickness: boardThickness,
                      traceExtrusion: traceExtrusion,
                      expansion: traceExpansion,
                      holeScale: holeSizeScale,
                      holeThreshold: holeThreshold,
                      svgTracesInnerHtml: document.getElementById('svg-traces-layer')?.innerHTML
                    });
                  }}
                  disabled={!gerberData}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]"
                >
                  <Download className="w-5 h-5" />
                  Generate 3D Model
                </button>
              </div>
            </div>
          </section>
        </div>
      </aside>

      {/* Main View */}
      <main className="flex-1 relative p-6 flex flex-col gap-6">
        {/* Top Header */}
        <header className="flex justify-between items-center z-10">
          <div className="glass-panel px-4 py-2 border-white/10 flex gap-4 shadow-xl items-center">
            <button 
              onClick={() => setViewMode('fit')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'fit' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'}`}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('zoom')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'zoom' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'}`}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
            <button
              onClick={clearProject}
              disabled={!gerberData && !profileData && drillData.length === 0}
              className="p-1.5 rounded-lg transition-colors text-red-500/80 hover:text-red-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Clear Project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-4 items-center">
            <div className="glass-panel px-4 py-2 border-white/10 flex gap-4 items-center">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mr-1">Board Dimensions</span>
              <span className="font-mono text-sm font-bold text-white tracking-widest">{pcbWidth.toFixed(2)} × {pcbHeight.toFixed(2)} mm</span>
            </div>

            <div className="glass-panel px-4 py-2 border-white/10 flex gap-4 items-center">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mr-1">Hole Count</span>
              <span className="font-mono text-sm font-bold text-emerald-400 tracking-widest">{drillData.length}</span>
            </div>
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 glass-panel relative overflow-hidden bg-black/40 flex items-center justify-center p-12">
          <AnimatePresence mode="wait">
            {!gerberData && !profileData && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="flex flex-col items-center text-center gap-8 max-w-sm"
              >
                <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-[2rem] flex items-center justify-center relative group">
                  <div className="absolute inset-0 bg-orange-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Upload className="text-orange-400 w-8 h-8 relative z-10" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold tracking-tight">Awaiting Gerber Input</h3>
                  <p className="text-white/40 text-sm leading-relaxed">
                    Import your copper layer, board profile, and drill maps to begin the visual synthesis and geometry modification.
                  </p>
                </div>
              </motion.div>
            )}

            {(gerberData || profileData) && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full flex items-center justify-center relative cursor-crosshair"
              >
                {/* SVG Background Layer */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                  <div className="w-[80%] h-[80%] border border-white/5 grid grid-cols-8 grid-rows-8">
                    {[...Array(64)].map((_, i) => <div key={i} className="border border-white/[0.02]" />)}
                  </div>
                </div>

                <svg
                  viewBox={`${combinedBBox.minX - padding} ${combinedBBox.minY - padding} ${pcbWidth + padding * 2} ${pcbHeight + padding * 2}`}
                  className="max-h-full max-w-full drop-shadow-[0_40px_80px_rgba(0,0,0,0.9)] filter transition-transform duration-500 ease-out"
                  style={{ transform: `scaleY(-1) ${viewMode === 'zoom' ? 'scale(1.5)' : 'scale(1)'}` }}
                >
                  {/* Board Background (Greenish Substrate) */}
                  <rect 
                    x={combinedBBox.minX - 2} 
                    y={combinedBBox.minY - 2} 
                    width={pcbWidth + 4} 
                    height={pcbHeight + 4} 
                    fill="#020617" 
                    rx="2"
                  />

                  {/* Profile / Milling Layer */}
                  <g className="profile text-emerald-500/40">
                    {profileData?.traces.map((trace, i) => (
                      <line
                        key={`profile-${i}`}
                        x1={trace.points[0].x}
                        y1={trace.points[0].y}
                        x2={trace.points[1].x}
                        y2={trace.points[1].y}
                        stroke="currentColor"
                        strokeWidth={Math.max(0.2, trace.apertureSize)} // Static size for profile
                        strokeLinecap="round"
                      />
                    ))}
                  </g>

                  {/* Copper Traces Layer */}
                  <g id="svg-traces-layer" className="traces text-orange-400">
                    {gerberData?.traces.map((trace, i) => (
                      <line
                        key={`trace-${i}`}
                        x1={trace.points[0].x}
                        y1={trace.points[0].y}
                        x2={trace.points[1].x}
                        y2={trace.points[1].y}
                        stroke="currentColor"
                        strokeWidth={Math.max(0.01, trace.apertureSize * traceExpansion)}
                        strokeLinecap="round"
                        opacity={0.8}
                        className="transition-[stroke-width] duration-300"
                      />
                    ))}
                  </g>

                  {/* Drill Holes Layer */}
                  <g className="holes text-white">
                    {drillData.map((hole, i) => {
                      const isTarget = hole.size < holeThreshold;
                      const finalSize = isTarget ? hole.size * holeSizeScale : hole.size;
                      return (
                        <circle
                          key={`hole-${i}`}
                          cx={hole.x}
                          cy={hole.y}
                          r={finalSize / 2}
                          fill="currentColor"
                          className="transition-[r] duration-300"
                        />
                      );
                    })}
                  </g>
                </svg>

                {/* Legend / Status Overlay */}
                <div className="absolute bottom-6 right-6 flex flex-col gap-2">
                  <div className="glass-panel px-3 py-1.5 flex items-center gap-3 border-white/5">
                    <div className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_8px_#fb923c]" />
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Active Copper</span>
                  </div>
                  <div className="glass-panel px-3 py-1.5 flex items-center gap-3 border-white/5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Base Profile</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
