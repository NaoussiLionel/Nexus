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
    const { origX, origY, startX, startY } = panCtx.current;
    setCanvas(prev => ({
      ...prev,
      x: origX + (e.clientX - startX),
      y: origY + (e.clientY - startY)
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
