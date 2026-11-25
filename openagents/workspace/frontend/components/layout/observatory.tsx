'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Orbit, Pause, Play } from 'lucide-react';
import { useT } from '@/lib/i18n';
import type { OpticsRenderer } from '@/lib/observatory/optics';

// The photon ring is at sqrt(27) in the optics table, across a 28-unit view.
const SHADOW_DIAMETER_AT_UNIT_ZOOM = 2 * Math.sqrt(27) / 28;

export function Observatory() {
  const t = useT();
  const login = usePathname() === '/login';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refresh = useRef<() => void>(() => {});
  const [moving, setMoving] = useState(false);
  const [lensing, setLensing] = useState(true);
  const [ready, setReady] = useState(false);
  const settings = useRef({ moving, lensing, login });

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const restore = () => {
      const stored = localStorage.getItem('map-optics-motion');
      setMoving(!preference.matches && stored !== 'off');
    };
    restore();
    setLensing(localStorage.getItem('map-optics-lens') !== 'off');
    preference.addEventListener('change', restore);
    return () => preference.removeEventListener('change', restore);
  }, []);

  useEffect(() => {
    settings.current = { moving, lensing, login };
    refresh.current();
  }, [moving, lensing, login]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const controller = new AbortController();
    const { signal } = controller;
    let renderer: OpticsRenderer | undefined;
    let timer = 0;
    let last = 0;
    let clock = 2;
    let visible = true;
    let targetAzimuth = .56, azimuth = .56;
    let targetPitch = 77, pitch = 77;
    let width = 0, height = 0;
    let painted = false;

    function draw() {
      if (!renderer || signal.aborted || document.hidden || !visible || !width || !height) return;
      const now = performance.now();
      const { moving, lensing, login } = settings.current;
      const delta = last ? Math.min((now - last) / 1000, 0.22) : 0;
      last = now;
      if (moving) {
        clock += delta;
        const ease = 1 - Math.exp(-8 * delta);
        azimuth += (targetAzimuth - azimuth) * ease;
        pitch += (targetPitch - pitch) * ease;
      }
      const scale = Math.min(window.devicePixelRatio, (renderer.software ? 440 : 1360) / width);
      renderer.draw({
        centerX: login && width > 720 ? .3 : .5,
        centerY: login && width <= 720 ? .22 : .5,
        incl: (pitch % 360) * Math.PI / 180,
        az: azimuth,
        zoom: (login ? .25 : .20) / SHADOW_DIAMETER_AT_UNIT_ZOOM,
        ev: 0, clock, lens: Number(lensing),
      }, Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)));
      if (!painted) { painted = true; setReady(true); }
      if (moving) timer = window.setTimeout(draw, 1000 / (renderer.software ? 8 : 24));
    }
    function update() {
      window.clearTimeout(timer);
      last = 0;
      draw();
    }
    refresh.current = update;
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      update();
    });
    resize.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    intersection.observe(canvas);
    window.addEventListener('pointermove', (event) => {
      if (settings.current.moving) targetAzimuth = .56 + (event.clientX / window.innerWidth - .5) * (Math.PI / 2);
    }, { passive: true, signal });
    window.addEventListener('wheel', (event) => {
      if (!settings.current.moving || event.ctrlKey) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      targetPitch += event.deltaY * unit * .075;
    }, { capture: true, passive: true, signal });
    document.addEventListener('visibilitychange', update, { signal });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      renderer = undefined;
      painted = false;
      window.clearTimeout(timer);
      setReady(false);
    }, { signal });
    async function initialize() {
      try {
        const { blackHoleRenderer } = await import('@/lib/observatory/optics');
        if (signal.aborted) return;
        renderer = await blackHoleRenderer(canvas, signal);
        if (signal.aborted) { renderer.dispose?.(); return; }
        update();
      } catch { if (!signal.aborted) setReady(false); }
    }
    canvas.addEventListener('webglcontextrestored', initialize, { signal });
    void initialize();
    return () => {
      controller.abort();
      refresh.current = () => {};
      window.clearTimeout(timer);
      resize.disconnect();
      intersection.disconnect();
      renderer?.dispose?.();
    };
  }, []);

  return <>
    <div className="observatory-sky" aria-hidden="true">
      <canvas ref={canvasRef} data-ready={ready} />
    </div>
    <div className="observatory-bar">
      <a href="/?workspaces=1" className="observatory-identity" title={t('dashboard.desktopHeading')}>
        <img src="/observatory/mark.svg" width="23" height="23" alt=""/><span>MultiAgents <em>Platform</em></span>
      </a>
    {ready && <div className="observatory-controls">
      <button type="button" title={t('optics.lens')} aria-label={t('optics.lens')} aria-pressed={lensing} onClick={() => {
        localStorage.setItem('map-optics-lens', lensing ? 'off' : 'on');
        setLensing(!lensing);
      }}><Orbit size={15}/></button>
      <button type="button" aria-label={t(moving ? 'optics.pause' : 'optics.play')} title={t(moving ? 'optics.pause' : 'optics.play')} onClick={() => {
        localStorage.setItem('map-optics-motion', moving ? 'off' : 'on');
        setMoving(!moving);
      }}>{moving ? <Pause size={14}/> : <Play size={14}/>}</button>
    </div>}
    </div>
  </>;
}
