// fuse-shared.jsx — shared primitives: wordmark, mark glyph, hooks, waveform

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─────────────────────────────────────────────────────────────
// MARK — two overlapping ripples merging. Used as the "fuse" glyph.
// ─────────────────────────────────────────────────────────────
function FuseMark({ size = 22, color = "currentColor", animate = false }) {
  const id = useMemo(() => "fm-" + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id={id + "g"} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#${id}g)`} />
      <circle cx="11" cy="16" r="7.5" fill="none" stroke={color} strokeWidth="1.5">
        {animate && <animate attributeName="r" values="7.5;8.4;7.5" dur="1.6s" repeatCount="indefinite" />}
      </circle>
      <circle cx="21" cy="16" r="7.5" fill="none" stroke={color} strokeWidth="1.5">
        {animate && <animate attributeName="r" values="7.5;8.4;7.5" dur="1.6s" begin="0.1s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}

function Wordmark({ size = 28, color = "var(--ink)" }) {
  return (
    <span className="wordmark" style={{ fontSize: size, color }}>
      <span className="mk-glyph"><FuseMark size={size * 0.85} color={color} /></span>
      <span>Fu<span className="mk-it">s</span>e<span style={{ color: "var(--pulse)", marginLeft: 1 }}>!</span></span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// HEARTBEAT SIMULATOR — global ticker that fires "beat" events.
// One participant has a steady-ish BPM with HRV jitter.
// ─────────────────────────────────────────────────────────────
function makeParticipants(n, seed = 1) {
  const names = [
    "Eline","Jasper","Sanne","Niels","Lotte","Bram","Maud","Joost","Fenna","Roel",
    "Tess","Pim","Marit","Cas","Lieke","Sven","Anouk","Daan","Roos","Stijn",
    "Iris","Lars","Sara","Tim","Noor","Koen","Femke","Jules","Yara","Tobias",
    "Maya","Hugo","Lena","Wessel","Sofie","Olaf","Esmee","Boris","Lila","Otto",
    "Helena","Mees","Liv","Ruben","Suze","Floor","Tijn","Pien","Joep","Annick",
    "Vera","Niek","Lize","Mats","Tess","Vince","Linde","Sem","Eva","Lukas",
    "Saar","Robin","Indy","Joris","Kim","Casper","Janna","Bart","Lena","Wout",
    "Mira","Levi","Annelie","Sjoerd","Nora","Twan","Lara","Maarten","Mila","Hidde"
  ];
  let s = seed;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({length: n}, (_, i) => ({
    id: i,
    name: names[i % names.length] + (i >= names.length ? "·" + Math.floor(i/names.length) : ""),
    baseBpm: 62 + Math.round(rand() * 38), // 62–100
    mac: macFromIndex(i, seed)
  }));
}
function macFromIndex(i, seed = 1) {
  const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  let s = seed * 7 + i * 31;
  const r = () => { s = (s * 9301 + 49297) % 233280; return Math.floor((s/233280)*256); };
  return ["F8","C0", hex(r()), hex(r()), hex(r()), hex(r())].join(":");
}

/**
 * useHeartbeat(opts) — returns reactive bpm + 'beat' tick + waveform sample function.
 *   opts: { baseBpm, intensity (0.5..2), running }
 * Beats land at instant times; the bpm we display is smoothed.
 */
function useHeartbeat({ baseBpm = 72, intensity = 1, running = true } = {}) {
  const [bpm, setBpm] = useState(baseBpm);
  const [tick, setTick] = useState(0); // increments on each beat
  const stateRef = useRef({ lastBeat: performance.now(), nextBeat: performance.now() + 60000/baseBpm });
  useEffect(() => {
    if (!running) return;
    let raf;
    const loop = () => {
      const now = performance.now();
      if (now >= stateRef.current.nextBeat) {
        // HRV: small jitter around base
        const jitter = (Math.random() - 0.5) * 8 * intensity;
        const driftBpm = baseBpm * intensity + jitter;
        const clamped = Math.max(45, Math.min(160, driftBpm));
        setBpm(b => b + (clamped - b) * 0.18);
        setTick(t => t + 1);
        stateRef.current.lastBeat = now;
        stateRef.current.nextBeat = now + 60000 / clamped;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [baseBpm, intensity, running]);
  return { bpm: Math.round(bpm), tick, getPhase: () => {
      const now = performance.now();
      const span = stateRef.current.nextBeat - stateRef.current.lastBeat;
      const since = now - stateRef.current.lastBeat;
      return Math.max(0, Math.min(1, since / span));
    }};
}

// shared 1s ticker (for smooth animations that don't need their own RAF)
function useFrame() {
  const [, force] = useState(0);
  useEffect(() => {
    let raf;
    const loop = () => { force(v => v+1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

// ─────────────────────────────────────────────────────────────
// WAVEFORM — scrolling biofeedback line.
// PQRST-ish: a soft baseline with periodic warm spikes.
// Renders into a fixed-width SVG, treats history as a buffer.
// ─────────────────────────────────────────────────────────────
function HeartWaveform({
  width = 800,
  height = 200,
  bpm = 72,
  intensity = 1,
  color = "var(--pulse)",
  fill = "var(--pulse-soft)",
  showGrid = true,
  speed = 80, // px/sec of scroll
  thickness = 2,
  glow = true,
}) {
  const ref = useRef(null);
  const stateRef = useRef({ t: 0, pts: [], lastBeat: -9999, beatX: -9999, last: performance.now() });

  useEffect(() => {
    let raf;
    const beatInterval = () => 60000 / Math.max(40, Math.min(180, bpm));
    const loop = (now) => {
      const dt = Math.min(64, now - stateRef.current.last);
      stateRef.current.last = now;
      stateRef.current.t += dt;

      const x = stateRef.current.t * (speed / 1000);
      // Determine if a beat starts
      if (now - stateRef.current.lastBeat >= beatInterval()) {
        stateRef.current.lastBeat = now;
        stateRef.current.beatX = x;
      }
      // Y signal — baseline + spike envelope near beatX
      const dx = x - stateRef.current.beatX;
      const baseline = (Math.sin(x * 0.08) * 1.4 + Math.sin(x * 0.21) * 0.7) * intensity * 0.5;
      // P wave bump
      const p = dx > 2 && dx < 10 ? Math.sin(((dx-2)/8) * Math.PI) * 6 : 0;
      // QRS spike
      let qrs = 0;
      if (dx > 10 && dx < 16) qrs = -((dx-10)/6) * 14; // Q dip
      else if (dx > 16 && dx < 22) qrs = ((dx-16)/6) * 70 - 14; // R spike up
      else if (dx > 22 && dx < 28) qrs = 56 - ((dx-22)/6) * 70; // S dip
      else if (dx > 28 && dx < 34) qrs = -14 + ((dx-28)/6) * 14; // recovery
      // T wave
      const tw = dx > 38 && dx < 58 ? Math.sin(((dx-38)/20) * Math.PI) * 9 : 0;
      const y = baseline + (p + qrs + tw) * (0.6 + 0.4 * intensity);

      stateRef.current.pts.push({ x, y });
      // Drop offscreen points
      const cutoff = x - width - 4;
      while (stateRef.current.pts.length && stateRef.current.pts[0].x < cutoff) {
        stateRef.current.pts.shift();
      }

      if (ref.current) {
        const path = stateRef.current.pts;
        if (path.length > 1) {
          const x0 = path[path.length - 1].x; // newest x is rightmost
          let d = "";
          let dFill = "";
          for (let i = 0; i < path.length; i++) {
            const px = width - (x0 - path[i].x);
            const py = height / 2 - path[i].y;
            d += (i === 0 ? "M" : "L") + px.toFixed(2) + " " + py.toFixed(2) + " ";
          }
          // Fill path: extend line to bottom
          dFill = d + `L ${width} ${height} L 0 ${height} Z`;
          ref.current.querySelector(".wf-line").setAttribute("d", d);
          if (glow) ref.current.querySelector(".wf-fill").setAttribute("d", dFill);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bpm, intensity, width, height, speed, glow]);

  return (
    <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display:"block" }}>
      <defs>
        <linearGradient id="wf-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.55" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showGrid && (
        <g opacity="0.55">
          {Array.from({length: Math.ceil(width/40)}).map((_,i) => (
            <line key={"v"+i} x1={i*40} y1="0" x2={i*40} y2={height} stroke="var(--line)" strokeWidth="1"/>
          ))}
          {Array.from({length: Math.ceil(height/40)}).map((_,i) => (
            <line key={"h"+i} x1="0" y1={i*40} x2={width} y2={i*40} stroke="var(--line)" strokeWidth="1"/>
          ))}
        </g>
      )}
      {glow && <path className="wf-fill" d="" fill="url(#wf-grad)" />}
      <path className="wf-line" d="" fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// PULSE ORB — a soft, glowing disc that breathes with the beat.
// ─────────────────────────────────────────────────────────────
function PulseOrb({ size = 120, bpm = 72, color = "var(--pulse)", soft = "var(--pulse-soft)", label, sublabel, running = true, intensity = 1 }) {
  const { tick, getPhase } = useHeartbeat({ baseBpm: bpm, running, intensity });
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const loop = () => {
      const p = getPhase();
      // beat envelope: rapid expand then ease back
      let env = 0;
      if (p < 0.18) env = (p/0.18); else if (p < 0.5) env = 1 - ((p - 0.18) / 0.32);
      const scale = 1 + env * 0.18 * intensity;
      if (ref.current) ref.current.style.transform = `scale(${scale.toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [intensity]);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap: 10 }}>
      <div style={{ width: size, height: size, position:"relative" }}>
        <div ref={ref} style={{
          position:"absolute", inset:0, borderRadius:"50%",
          background: `radial-gradient(circle at 50% 50%, ${color} 0%, ${soft} 55%, transparent 75%)`,
          transition: "transform 30ms linear",
          transformOrigin: "center"
        }}/>
        <div style={{
          position:"absolute", inset: size*0.18, borderRadius:"50%",
          border: `1px solid ${color}`,
          opacity: 0.55
        }}/>
      </div>
      {(label || sublabel) && (
        <div style={{ textAlign:"center" }}>
          {label && <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>}
          {sublabel && <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WEBSOCKET CLIENT — connects as a browser client, subscribes to
// groups, and delivers heartbeat_event messages to listeners.
// Auto-reconnects and re-subscribes on disconnect.
// ─────────────────────────────────────────────────────────────
function useFuseSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const subsRef = useRef(new Set());
  const handlersRef = useRef({});

  useEffect(() => {
    const url = `ws://${window.location.host}/ws`;
    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "identify", client_type: "client" }));
        subsRef.current.forEach(gid =>
          ws.send(JSON.stringify({ type: "subscribe", group_id: gid }))
        );
        setConnected(true);
      };
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onmessage = (e) => {
        try { const m = JSON.parse(e.data); handlersRef.current[m.type]?.(m); } catch (_) {}
      };
    };
    connect();
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, []);

  const subscribe = (gid) => {
    subsRef.current.add(gid);
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "subscribe", group_id: gid }));
  };
  const unsubscribe = (gid) => {
    subsRef.current.delete(gid);
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", group_id: gid }));
  };
  const on = (type, handler) => { handlersRef.current[type] = handler; };

  return { connected, subscribe, unsubscribe, on };
}

// expose
Object.assign(window, {
  FuseMark, Wordmark, useHeartbeat, useFrame, HeartWaveform, PulseOrb,
  makeParticipants, macFromIndex, useFuseSocket
});
