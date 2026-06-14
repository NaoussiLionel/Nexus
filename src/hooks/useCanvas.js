import { useRef, useCallback } from 'react';
import { useNexus } from '../store/NexusContext';

export function useCanvas() {
  const { canvas, setCanvas } = useNexus();
  const panCtx = useRef(null);
  const wrapRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest('.mind-node') || e.target.closest('.title-block') || e.target.closest('.isolate-bar')) return;
    panCtx.current = { startX: e.clientX, startY: e.clientY, origX: canvas.x, origY: canvas.y };
    const wrap = wrapRef.current;
    if (wrap) wrap.classList.add('panning');
  }, [canvas]);

  const onPointerMove = useCallback((e) => {
    if (!panCtx.current) return;
    setCanvas(prev => ({
      ...prev,
      x: panCtx.current.origX + (e.clientX - panCtx.current.startX),
      y: panCtx.current.origY + (e.clientY - panCtx.current.startY)
    }));
  }, [setCanvas]);

  const onPointerUp = useCallback(() => {
    if (panCtx.current) {
      panCtx.current = null;
      const wrap = wrapRef.current;
      if (wrap) wrap.classList.remove('panning');
    }
  }, []);

  return { wrapRef, onPointerDown, onPointerMove, onPointerUp };
}
