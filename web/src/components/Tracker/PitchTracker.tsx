import { useEffect, useRef } from 'react';
import { useWebSocket } from '../../api/useWebSocket';

export default function PitchTracker({ matchId }: { matchId: string }) {
  const { pitchStates } = useWebSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const state = pitchStates[matchId];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw field
    ctx.fillStyle = '#4ade80'; // grass green
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 30, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw ball if state exists
    if (state) {
      ctx.fillStyle = '#ef4444'; // Red ball
      ctx.beginPath();
      ctx.arc(state.ballX * canvas.width, state.ballY * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }

  }, [state]);

  if (!state) return (
    <div className="bg-secondary h-48 flex items-center justify-center text-text-secondary border border-tertiary rounded">
      <div className="animate-pulse flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-accent-green"></span>
        Connecting to 3D Live Pitch Feed...
      </div>
    </div>
  );

  return (
    <div className="bg-secondary p-4 rounded border border-tertiary shadow-lg">
      <div className="relative w-full aspect-[2/1] bg-emerald-800 rounded-lg overflow-hidden mb-4 border border-emerald-600/50 shadow-inner">
        <canvas ref={canvasRef} width={800} height={400} className="w-full h-full" />
        {state.eventText && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur text-white px-5 py-2 rounded-full font-bold text-sm border border-white/20 shadow-lg flex items-center gap-2 animate-bounce">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-yellow"></span>
            {state.eventText}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 text-sm bg-primary/40 p-3 rounded border border-tertiary/50">
        <div>
          <div className="flex justify-between mb-1.5 font-medium">
            <span className="text-text-secondary">Home Possession</span>
            <span className="text-accent-blue font-bold">{state.homeStats?.possession || 50}%</span>
          </div>
          <div className="w-full bg-tertiary/60 h-2 rounded-full overflow-hidden">
            <div className="bg-accent-blue h-2 rounded-full transition-all duration-500" style={{width: `${state.homeStats?.possession || 50}%`}}></div>
          </div>
          
          <div className="flex justify-between mt-2.5 text-xs text-text-secondary">
            <span>Shots: <strong className="text-white">{state.homeStats?.shots || 0}</strong></span>
            <span>On Target: <strong className="text-white">{state.homeStats?.shotsOnTarget || 0}</strong></span>
            <span>Corners: <strong className="text-white">{state.homeStats?.corners || 0}</strong></span>
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1.5 font-medium">
            <span className="text-text-secondary">Away Possession</span>
            <span className="text-accent-red font-bold">{state.awayStats?.possession || 50}%</span>
          </div>
          <div className="w-full bg-tertiary/60 h-2 rounded-full overflow-hidden">
            <div className="bg-accent-red h-2 rounded-full transition-all duration-500" style={{width: `${state.awayStats?.possession || 50}%`}}></div>
          </div>
          
          <div className="flex justify-between mt-2.5 text-xs text-text-secondary">
            <span>Shots: <strong className="text-white">{state.awayStats?.shots || 0}</strong></span>
            <span>On Target: <strong className="text-white">{state.awayStats?.shotsOnTarget || 0}</strong></span>
            <span>Corners: <strong className="text-white">{state.awayStats?.corners || 0}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
