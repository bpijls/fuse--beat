// fuse-main.jsx — main studio app: Realtime, Groups, Fusion

const { useState: useStateM, useEffect: useEffectM, useMemo: useMemoM, useRef: useRefM } = React;

// shared header ─────────────────────────────────────────────
function StudioHeader({ tab, setTab, me, bpm, onReprovision, wsConnected }) {
  return (
    <div className="shell-hd">
      <div style={{ display:"flex", alignItems:"center", gap: 18 }}>
        <Wordmark size={26} />
        <span style={{ width: 1, height: 22, background: "var(--line)" }}/>
        {/* <span className="eyebrow">Studio · live</span> */}
      </div>
      <div className="tabs">
        {[
          ["realtime", "Realtime", "Your own beat"],
          ["groups", "Groups", "Find your team"],
          ["fusion", "Fusion", "Everyone, together"]
        ].map(([k, l]) => (
          <div key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
            {l}
          </div>
        ))}
      </div>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={onReprovision} title="Re-pair this sensor or set up a new one">
          ↻ Set up sensor
        </button>
      </div>
    </div>
  );
}

// ─── REALTIME ────────────────────────────────────────────────
function RealtimeTab({ me, intensity }) {
  const [conn, setConn] = useStateM("idle"); // idle | connecting | live
  const [w, setW]       = useStateM(900);
  const wrapRef   = useRefM(null);
  const canvasRef = useRefM(null);
  const portRef   = useRefM(null);
  const writerRef = useRefM(null);
  const readerRef = useRefM(null);
  const buf1Ref   = useRefM([]); // raw IR — plotted blue
  const buf2Ref   = useRefM([]); // IR + beat marker spike — plotted red
  const MAX_PTS   = 400;         // ~4 s at 100 Hz

  useEffectM(() => {
    const ro = new ResizeObserver(es => { if (es[0]) setW(Math.max(400, es[0].contentRect.width - 2)); });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Cleanup when the tab is hidden / component unmounts
  useEffectM(() => () => { doClose(); }, []);

  const doClose = async () => {
    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch (_) {}
      await new Promise(r => setTimeout(r, 50)); // let releaseLock() run in readLoop's finally
    }
    if (writerRef.current) {
      try { await writerRef.current.write(new TextEncoder().encode("rawmode off\n")); } catch (_) {}
      try { writerRef.current.releaseLock(); } catch (_) {}
      writerRef.current = null;
    }
    if (portRef.current) {
      try { await portRef.current.close(); } catch (_) {}
      portRef.current = null;
    }
    setConn("idle");
  };

  const connect = async () => {
    setConn("connecting");
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      const writer = port.writable.getWriter();
      writerRef.current = writer;
      await writer.write(new TextEncoder().encode("rawmode on\n"));
      buf1Ref.current = [];
      buf2Ref.current = [];
      setConn("live");
      readLoop(port);
    } catch (err) {
      console.error("[RealtimeTab] connect:", err);
      setConn("idle");
    }
  };

  const readLoop = async (port) => {
    const dec = new TextDecoder();
    let partial = "";
    let reader;
    try {
      reader = port.readable.getReader();
      readerRef.current = reader;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        partial += dec.decode(value);
        const lines = partial.split("\n");
        partial = lines.pop() || "";
        for (const line of lines) {
          const parts = line.trim().split(",");
          if (parts.length === 2) {
            const v1 = parseInt(parts[0]);
            const v2 = parseInt(parts[1]);
            if (!isNaN(v1) && !isNaN(v2) && v1 > 0) {
              buf1Ref.current.push(v1);
              buf2Ref.current.push(v2);
              if (buf1Ref.current.length > MAX_PTS) buf1Ref.current.shift();
              if (buf2Ref.current.length > MAX_PTS) buf2Ref.current.shift();
            }
          }
        }
      }
    } catch (_) {}
    finally {
      if (reader) { try { reader.releaseLock(); } catch (_) {} }
      readerRef.current = null;
    }
  };

  // Canvas draw loop while live
  useEffectM(() => {
    if (conn !== "live") return;
    let id;
    const draw = () => {
      rtDraw(canvasRef.current, buf1Ref.current, buf2Ref.current);
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [conn]);

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      <div className="spread" style={{ marginBottom: 24, alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Realtime · calibration</div>
          <h1 className="serif" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 4 }}>
            How a heartbeat <span style={{ fontStyle:"italic" }}>looks</span> to your sensor.
          </h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6, maxWidth: 620 }}>
            The puck shines a tiny light through your fingertip and measures what comes out the other side. Each pulse of blood blocks a little more — that's the wiggle below. Find the pressure that gives the cleanest line.
          </p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
          {conn === "live" && <>
            <span className="tag sage"><span className="dot live"/>serial open</span>
            <button className="btn btn-ghost btn-sm" onClick={doClose}>Disconnect</button>
          </>}
          {conn === "connecting" && <span className="tag amber">opening port…</span>}
          {conn === "idle" && <span className="tag">offline</span>}
        </div>
      </div>

      {conn !== "live" ? (
        <div className="card" style={{ padding: 56, display:"flex", flexDirection:"column", alignItems:"center", gap: 20, textAlign:"center" }}>
          <FuseMark size={72} color="var(--pulse)" animate />
          <div className="serif" style={{ fontSize: 30, lineHeight: 1.1, maxWidth: 520 }}>
            Open a serial link to your <span style={{ fontStyle:"italic" }}>fuse·node</span> to watch its raw signal.
          </div>
          <p className="muted" style={{ fontSize: 14, maxWidth: 500, margin: 0 }}>
            Your browser will ask which USB device to talk to — pick the one labelled <span className="mono" style={{ fontSize: 12 }}>usbmodem-FUSE…</span>.
          </p>
          <button className="btn btn-pulse btn-lg" onClick={connect} disabled={conn === "connecting"} style={conn === "connecting" ? { opacity: 0.6 } : {}}>
            {conn === "connecting" ? "Connecting…" : "Connect →"}
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 28, display:"flex", flexDirection:"column", gap: 16 }}>
          <div className="spread">
            <div className="eyebrow">Raw IR signal · last 4 s</div>
            <div style={{ fontSize: 12, color:"var(--ink-3)", maxWidth: 540, textAlign:"right", lineHeight: 1.5 }}>
              Rest your fingertip on the pad and watch the wave. Try pressing softly, then firmly — find the touch that makes it cleanest.
            </div>
          </div>
          <div ref={wrapRef} style={{ minWidth: 0 }}>
            <div style={{ borderRadius: 12, overflow:"hidden", border: "1px solid var(--line)" }}>
              <canvas ref={canvasRef} width={w} height={320} style={{ display:"block", width:"100%", height: 320 }} />
            </div>
          </div>
          <div style={{ display:"flex", gap: 20, fontSize: 12, color:"var(--ink-3)" }}>
            <span style={{ display:"flex", alignItems:"center", gap: 6 }}>
              <span style={{ width: 24, height: 2, background:"rgba(80,140,220,0.9)", display:"inline-block", borderRadius: 1 }} />
              IR signal
            </span>
            <span style={{ display:"flex", alignItems:"center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background:"rgba(100,200,100,0.9)", display:"inline-block", borderRadius: "50%" }} />
              Beat detected
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function rtDraw(canvas, buf1, buf2) {
  if (!canvas || buf1.length < 2) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#13110f";
  ctx.fillRect(0, 0, W, H);

  const lo  = Math.min(...buf1);
  const hi  = Math.max(...buf1);
  const rng = Math.max(hi - lo, 1);
  const pad = 12;
  const toY = v => pad + (H - 2 * pad) * (1 - (v - lo) / rng);
  const toX = (i, n) => (i / (n - 1)) * W;
  const n   = buf1.length;

  // IR signal — blue line
  ctx.beginPath();
  ctx.strokeStyle = "rgba(80,140,220,0.9)";
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  buf1.forEach((v, i) => {
    const x = toX(i, n), y = toY(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Beat markers — green circle wherever channel 2 diverges from channel 1 by > 1
  ctx.fillStyle = "rgba(100,200,100,0.9)";
  for (let i = 0; i < n; i++) {
    if ((buf2[i] - buf1[i]) > 1.0) {
      ctx.beginPath();
      ctx.arc(toX(i, n), toY(buf1[i]), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// finger + sensor cross-section visual
function FingerOnSensor({ pressure, zone }) {
  // pressure 0..100 → finger sits closer to sensor
  const offset = 26 - (pressure / 100) * 24;
  const skinSquish = Math.max(0, (pressure - 60) / 40) * 8;
  const tint = zone === "good" ? "#6f8b6a" : zone === "soft" ? "#c98b3a" : "#d44a3a";
  return (
    <div style={{ position:"relative", height: 130, background:"var(--bone-2)", borderRadius: 12, border:"1px solid var(--line)", overflow:"hidden" }}>
      {/* light beam */}
      <svg viewBox="0 0 240 130" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ position:"absolute", inset: 0 }}>
        {/* sensor pad */}
        <rect x="60" y="92" width="120" height="22" rx="6" fill="#3a3022" />
        <circle cx="100" cy="103" r="4" fill={tint} opacity="0.9">
          <animate attributeName="opacity" values="0.55;1;0.55" dur="1.4s" repeatCount="indefinite"/>
        </circle>
        <rect x="138" y="99" width="8" height="8" rx="1" fill="#cdb588" />
        {/* light beam */}
        <path d={`M 102 99 L ${130} ${52 + offset} L ${140} ${52 + offset} L 144 99 Z`} fill={tint} opacity={Math.max(0.05, 0.16 - skinSquish/40)} />
        {/* finger */}
        <path d={`
          M 30 ${30 + offset}
          C 50 ${20 + offset - skinSquish/2}, 110 ${15 + offset - skinSquish}, 170 ${22 + offset - skinSquish/2}
          C 210 ${28 + offset}, 230 ${48 + offset + skinSquish/2}, 230 ${65 + offset + skinSquish}
          L 230 92
          L 30 92 Z
        `} fill="#e9c8a4" stroke="#b48766" strokeWidth="1"/>
        {/* nail bed highlight */}
        <ellipse cx="120" cy={42 + offset} rx="36" ry="9" fill="#f3d8b6" opacity="0.7"/>
        {/* label */}
        <text x="120" y="125" fontFamily="Geist Mono, monospace" fontSize="8" fill="#7a6b58" textAnchor="middle">FUSE·NODE · PD + LED</text>
      </svg>
    </div>
  );
}

// smooth optical translucency waveform — controlled by amplitude/noise/clipped
function TranslucencyWaveform({ width, height, amplitude, noise, clipped, color }) {
  const ref = useRefM(null);
  const stateRef = useRefM({ t: 0, pts: [], last: performance.now() });
  const ampRef = useRefM(amplitude);
  const noiseRef = useRefM(noise);
  const clippedRef = useRefM(clipped);
  useEffectM(() => { ampRef.current = amplitude; noiseRef.current = noise; clippedRef.current = clipped; }, [amplitude, noise, clipped]);

  useEffectM(() => {
    let raf;
    const speed = 70;
    const loop = (now) => {
      const dt = Math.min(64, now - stateRef.current.last);
      stateRef.current.last = now;
      stateRef.current.t += dt;
      const x = stateRef.current.t * (speed / 1000);
      // pulse wave shape — a smooth bumpy oscillation
      const pulse = 1.1; // Hz ~ 66 bpm
      const phase = (stateRef.current.t / 1000) * pulse * Math.PI * 2;
      let y = Math.sin(phase) * 22 + Math.sin(phase * 2 + 0.7) * 6;
      // baseline drift
      y += Math.sin(stateRef.current.t / 1300) * 4;
      // amplitude shape
      y *= ampRef.current;
      // noise
      y += (Math.random() - 0.5) * 30 * noiseRef.current;
      // clipping (too hard)
      if (clippedRef.current) y = Math.max(-6, Math.min(6, y));

      stateRef.current.pts.push({ x, y });
      const cutoff = x - width - 4;
      while (stateRef.current.pts.length && stateRef.current.pts[0].x < cutoff) stateRef.current.pts.shift();

      if (ref.current && stateRef.current.pts.length > 1) {
        const path = stateRef.current.pts;
        const x0 = path[path.length - 1].x;
        let d = "";
        for (let i = 0; i < path.length; i++) {
          const px = width - (x0 - path[i].x);
          const py = height / 2 - path[i].y;
          d += (i === 0 ? "M" : "L") + px.toFixed(2) + " " + py.toFixed(2) + " ";
        }
        const dFill = d + `L ${width} ${height} L 0 ${height} Z`;
        ref.current.querySelector(".tw-line").setAttribute("d", d);
        ref.current.querySelector(".tw-fill").setAttribute("d", dFill);
        ref.current.querySelector(".tw-line").setAttribute("stroke", color);
        ref.current.querySelector(".tw-fill").setAttribute("fill", `url(#tw-grad-${color.replace(/[^a-z0-9]/gi,'')})`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height, color]);

  const gid = "tw-grad-" + color.replace(/[^a-z0-9]/gi,'');
  return (
    <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display:"block" }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <g opacity="0.55">
        {Array.from({length: Math.ceil(width/40)}).map((_,i) => (
          <line key={"v"+i} x1={i*40} y1="0" x2={i*40} y2={height} stroke="var(--line)" strokeWidth="1"/>
        ))}
        {Array.from({length: Math.ceil(height/40)}).map((_,i) => (
          <line key={"h"+i} x1="0" y1={i*40} x2={width} y2={i*40} stroke="var(--line)" strokeWidth="1"/>
        ))}
      </g>
      <path className="tw-fill" d="" fill={`url(#${gid})`}/>
      <path className="tw-line" d="" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "var(--bone-2)", border: "1px solid var(--line)" }}>
      <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform:"uppercase", color:"var(--ink-3)" }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, marginTop: 4, color:"var(--ink)" }}>
        {value}<span style={{ fontSize: 11, color:"var(--ink-3)", marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── GROUPS ──────────────────────────────────────────────────
const GROUP_COLORS = ["#d44a3a","#c98b3a","#8a2f24","#6f8b6a","#7a5419","#a23a52","#3d6f6a","#6b4f8a","#d97a2a","#7a8a3a"];

function toGroupShape(g, idx) {
  return {
    id: g.group_id,
    name: g.group_id,
    emoji: "◐",
    members: g.device_count,
    capacity: 8,
    theme: "",
    color: g.colors?.[0] || GROUP_COLORS[idx % GROUP_COLORS.length],
  };
}

function GroupsTab({ me, joinedId, setJoinedId, socket }) {
  const [groups, setGroups] = useStateM([]);
  const [creating, setCreating] = useStateM(false);
  const [newName, setNewName] = useStateM("");
  const [newTheme, setNewTheme] = useStateM("");
  const prevJoinedRef = useRefM(null);

  const fetchGroups = () =>
    fetch("/groups/summary")
      .then(r => r.json())
      .then(data => setGroups(data.map(toGroupShape)))
      .catch(() => {});

  useEffectM(() => { fetchGroups(); }, []);

  // subscribe/unsubscribe when the joined group changes
  useEffectM(() => {
    if (socket) {
      if (prevJoinedRef.current) socket.unsubscribe(prevJoinedRef.current);
      if (joinedId) socket.subscribe(joinedId);
    }
    prevJoinedRef.current = joinedId;
  }, [joinedId, socket]);

  const create = async () => {
    if (!newName.trim()) return;
    const id = newName.trim().toLowerCase().replace(/\s+/g, "-");
    await fetch(`/groups/${encodeURIComponent(id)}`, { method: "POST" }).catch(() => {});
    await fetchGroups();
    setJoinedId(id);
    if (socket) socket.subscribe(id);
    setCreating(false); setNewName(""); setNewTheme("");
  };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      <div className="spread" style={{ marginBottom: 24 }}>
        <div>
          <div className="eyebrow">Groups</div>
          <h1 className="serif" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 4 }}>
            Find <span style={{ fontStyle:"italic" }}>your eight</span>.
          </h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6, maxWidth: 560 }}>
            Subscribe to a team's channel and your sensor will start mixing into their fusion. You can only sit in one group at a time.
          </p>
        </div>
        <div style={{ display:"flex", gap: 10 }}>
          <button className="btn btn-ghost btn-sm">Browse all 12</button>
          <button className="btn btn-pulse" onClick={() => setCreating(true)}>+ Start a group</button>
        </div>
      </div>

      {creating && (
        <div className="card" style={{ padding: 24, marginBottom: 20, display:"grid", gridTemplateColumns:"1fr 1fr auto", gap: 14, alignItems:"end" }}>
          <div className="field">
            <label>Group name</label>
            <input className="input" placeholder="e.g.  thirty-three drums" value={newName} onChange={e=>setNewName(e.target.value)} autoFocus/>
          </div>
          <div className="field">
            <label>Brief / theme</label>
            <input className="input" placeholder="What will you build?" value={newTheme} onChange={e=>setNewTheme(e.target.value)} />
          </div>
          <div style={{ display:"flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={()=>setCreating(false)}>Cancel</button>
            <button className="btn btn-pulse" onClick={create}>Create & join</button>
          </div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {groups.map(g => (
          <GroupCard key={g.id} g={g} joined={joinedId === g.id} onJoin={()=>setJoinedId(g.id)} onLeave={()=>setJoinedId(null)} myBpm={me.baseBpm}/>
        ))}
      </div>
    </div>
  );
}

function GroupCard({ g, joined, onJoin, onLeave, myBpm }) {
  // group rhythm: average around a slightly varying point
  const groupBpm = 64 + (g.id.charCodeAt(g.id.length-1) % 20);
  const { bpm } = useHeartbeat({ baseBpm: groupBpm });
  const full = g.members >= g.capacity;
  const members = joined ? g.members + 1 : g.members;

  return (
    <div className="card" style={{ padding: 20, display:"flex", flexDirection:"column", gap: 14, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle at 100% 0%, ${g.color}33, transparent 65%)`, pointerEvents:"none" }}/>
      <div className="spread">
        <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, display:"flex", alignItems:"center", justifyContent:"center",
            background: g.color + "1f", border: `1px solid ${g.color}55`, fontSize: 18
          }}>{g.emoji}</div>
          <div>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>{g.name}</div>
            <div style={{ fontSize: 12, color:"var(--ink-3)" }}>{g.theme}</div>
          </div>
        </div>
        {joined ? <span className="tag sage"><span className="dot live"/>you're in</span>
          : full ? <span className="tag">full</span>
          : <span className="tag">open</span>}
      </div>

      {/* mini waveform */}
      <div style={{ height: 60, borderRadius: 8, background:"var(--bone)", overflow:"hidden", border:"1px solid var(--line)" }}>
        <HeartWaveform width={400} height={60} bpm={bpm} intensity={0.7} color={g.color} fill={g.color} showGrid={false} thickness={1.6} speed={70}/>
      </div>

      <div className="spread" style={{ alignItems:"flex-end" }}>
        <div>
          <div className="eyebrow">Team avg</div>
          <div className="mono" style={{ fontSize: 20 }}>
            <span style={{ color: g.color }}>♥</span> {bpm} <span style={{ fontSize: 11, color:"var(--ink-3)" }}>bpm</span>
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ textAlign:"right" }}>Members</div>
          <div className="mono" style={{ fontSize: 20, textAlign:"right" }}>
            {members}<span style={{ fontSize: 11, color:"var(--ink-3)" }}>/{g.capacity}</span>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap: 8 }}>
        {joined ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={onLeave}>Leave</button>
            <button className="btn btn-ghost btn-sm">Open channel</button>
          </>
        ) : (
          <button className={"btn " + (full ? "btn-ghost" : "btn-pulse") + " btn-sm"} onClick={() => !full && onJoin()} disabled={full}>
            {full ? "Full" : "Subscribe →"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }}>···</button>
      </div>
    </div>
  );
}

// ─── FUSION ──────────────────────────────────────────────────
function FusionTab({ me, viewMode, palette, intensity, joinedGroupName, socket }) {
  const [groups, setGroups] = useStateM([]);
  const beatTimesRef = useRefM({});
  const [liveBpms, setLiveBpms] = useStateM({});

  useEffectM(() => {
    fetch("/groups/summary")
      .then(r => r.json())
      .then(data => {
        const shaped = data.map(toGroupShape);
        setGroups(shaped);
        if (socket) shaped.forEach(g => socket.subscribe(g.id));
      })
      .catch(() => {});
  }, [socket]);

  useEffectM(() => {
    if (!socket) return;
    socket.on("heartbeat_event", ({ group_id }) => {
      const arr = beatTimesRef.current[group_id] ||= [];
      arr.push(Date.now());
      if (arr.length > 8) arr.shift();
      if (arr.length >= 2) {
        const avg = (arr[arr.length - 1] - arr[0]) / (arr.length - 1);
        setLiveBpms(p => ({ ...p, [group_id]: Math.round(60000 / avg) }));
      }
    });
  }, [socket]);

  const groupsViz = groups.map(g => ({ ...g, bpm: liveBpms[g.id] || 72 }));

  // Aggregate average
  const totalMembers = groupsViz.reduce((a,g) => a + g.members, 0);
  const collectiveBpm = totalMembers > 0
    ? Math.round(groupsViz.reduce((a,g) => a + g.bpm * g.members, 0) / totalMembers)
    : 72;
  const { bpm: liveBpm } = useHeartbeat({ baseBpm: collectiveBpm, intensity: 0.5 });

  return (
    <div style={{ padding: "28px 32px 56px", maxWidth: 1600, margin: "0 auto" }}>
      <div className="spread" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Fusion · projected view</div>
          <h1 className="serif" style={{ fontSize: 44, lineHeight: 1.05, marginTop: 4 }}>
            The room as <span style={{ fontStyle:"italic" }}>one organism</span>.
          </h1>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
          <span className="tag"><span className="dot live"/>{totalMembers} sensors live</span>
          <span className="tag amber">{groupsViz.length} groups</span>
          <button className="btn btn-ghost btn-sm">⛶ Fullscreen for projector</button>
        </div>
      </div>

      <div className="card" style={{
        padding: 0, overflow:"hidden",
        background: "radial-gradient(circle at 50% 40%, #fbf7f0 0%, #f0e6d4 70%, #e4dccd 100%)",
        position:"relative", minHeight: 640
      }}>
        {/* center collective */}
        <div style={{ position:"absolute", inset: 0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <CollectiveCenter bpm={collectiveBpm} liveBpm={liveBpm} viewMode={viewMode} intensity={intensity}/>
        </div>

        {/* orbiting group nodes */}
        <GroupOrbits groups={groupsViz} viewMode={viewMode} />

        {/* corner metadata */}
        <div style={{ position:"absolute", top: 20, left: 20, display:"flex", flexDirection:"column", gap: 6 }}>
          <div className="eyebrow">Studio · 24·05 · 14:32</div>
          <div className="mono" style={{ fontSize: 12, color:"var(--ink-3)" }}>fuse://studio/global</div>
        </div>
        <div style={{ position:"absolute", top: 20, right: 20, textAlign:"right" }}>
          <div className="eyebrow">Collective avg</div>
          <div className="bpm-big" style={{ justifyContent:"flex-end" }}>
            <span className="n" style={{ fontSize: 56 }}>{liveBpm}</span><span className="u">bpm</span>
          </div>
        </div>
        <div style={{ position:"absolute", bottom: 20, left: 20, right: 20, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div className="mono" style={{ fontSize: 11, color:"var(--ink-3)" }}>
            ─── breathe in 4 · hold 4 · out 6 ───
          </div>
          <div style={{ display:"flex", gap: 6 }}>
            <span className="tag mono" style={{ fontSize: 10 }}>min 58</span>
            <span className="tag mono" style={{ fontSize: 10 }}>max 104</span>
            <span className="tag mono" style={{ fontSize: 10 }}>σ 11.2</span>
          </div>
        </div>
      </div>

      {/* group ranking strip */}
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Per group · sorted by intensity</div>
          {joinedGroupName && <span className="tag sage"><span className="dot live"/>you're in <b style={{ marginLeft: 4 }}>{joinedGroupName}</b></span>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap: 12 }}>
          {[...groupsViz].sort((a,b) => b.bpm - a.bpm).slice(0, 10).map(g => (
            <GroupRow key={g.id} g={g} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CollectiveCenter({ bpm, liveBpm, viewMode, intensity }) {
  const ref = useRefM(null);
  const { getPhase } = useHeartbeat({ baseBpm: bpm, intensity: 0.6 });
  useEffectM(() => {
    let raf;
    const loop = () => {
      const p = getPhase();
      let env = 0;
      if (p < 0.18) env = p/0.18; else if (p < 0.6) env = 1 - (p-0.18)/0.42;
      const scale = 1 + env * 0.12;
      if (ref.current) ref.current.style.transform = `translate(-50%,-50%) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={ref} style={{
      position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
      width: 320, height: 320, borderRadius:"50%",
      background: "radial-gradient(circle, rgba(212,74,58,.42) 0%, rgba(212,74,58,.18) 38%, rgba(212,74,58,.04) 70%, transparent 100%)",
      transformOrigin:"center"
    }}>
      <div style={{ position:"absolute", inset: 80, borderRadius:"50%", border:"1px solid rgba(212,74,58,.4)" }}/>
      <div style={{ position:"absolute", inset: 120, borderRadius:"50%", border:"1px dashed rgba(212,74,58,.3)" }}/>
    </div>
  );
}

function GroupOrbits({ groups, viewMode }) {
  // Place groups on an ellipse around center
  return (
    <div style={{ position:"absolute", inset: 0 }}>
      <svg style={{ position:"absolute", inset: 0, width:"100%", height:"100%" }} preserveAspectRatio="none">
        <defs>
          <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(212,74,58,.12)"/>
            <stop offset="100%" stopColor="transparent"/>
          </radialGradient>
        </defs>
        {/* concentric guide rings */}
        <g style={{ opacity: 0.4 }}>
          <ellipse cx="50%" cy="50%" rx="40%" ry="36%" fill="none" stroke="var(--line-2)" strokeDasharray="2 6"/>
          <ellipse cx="50%" cy="50%" rx="28%" ry="25%" fill="none" stroke="var(--line-2)" strokeDasharray="2 6"/>
        </g>
      </svg>
      {groups.map((g, i) => {
        const angle = (i / groups.length) * Math.PI * 2 - Math.PI / 2;
        const rx = 38, ry = 34;
        const x = 50 + Math.cos(angle) * rx;
        const y = 50 + Math.sin(angle) * ry;
        return <GroupNode key={g.id} g={g} xPct={x} yPct={y} />;
      })}
    </div>
  );
}

function GroupNode({ g, xPct, yPct }) {
  const ref = useRefM(null);
  const { bpm, getPhase } = useHeartbeat({ baseBpm: g.bpm });
  useEffectM(() => {
    let raf;
    const loop = () => {
      const p = getPhase();
      let env = 0;
      if (p < 0.18) env = p/0.18; else if (p < 0.5) env = 1 - (p-0.18)/0.32;
      const scale = 1 + env * 0.22;
      if (ref.current) ref.current.style.transform = `translate(-50%,-50%) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const size = 60 + g.members * 6;
  return (
    <div style={{ position:"absolute", left: xPct + "%", top: yPct + "%", textAlign:"center", pointerEvents:"none" }}>
      <div ref={ref} style={{
        width: size, height: size, borderRadius:"50%",
        background: `radial-gradient(circle, ${g.color}cc 0%, ${g.color}55 40%, ${g.color}00 75%)`,
        position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)",
        transformOrigin:"center"
      }}/>
      <div style={{
        position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)",
        width: size * 0.55, height: size * 0.55, borderRadius:"50%",
        border: `1px solid ${g.color}`,
        background: "rgba(251,247,240,.4)"
      }}/>
      <div style={{
        position:"absolute", left:"50%", top: size/2 + 14, transform:"translate(-50%, 0)",
        textAlign:"center", whiteSpace:"nowrap"
      }}>
        <div className="serif" style={{ fontSize: 16, lineHeight: 1.1 }}>{g.name}</div>
        <div className="mono" style={{ fontSize: 11, color: g.color }}>
          ♥ {bpm} · {g.members}
        </div>
      </div>
    </div>
  );
}

function GroupRow({ g }) {
  const { bpm } = useHeartbeat({ baseBpm: g.bpm });
  const pct = Math.min(100, ((bpm - 50) / 70) * 100);
  return (
    <div style={{ padding: 10, borderRadius: 8, background: "var(--bone-2)", border: "1px solid var(--line)" }}>
      <div className="spread">
        <div style={{ fontSize: 13, fontWeight: 500, color: g.color }}>{g.name}</div>
        <div className="mono" style={{ fontSize: 12 }}>{bpm}</div>
      </div>
      <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "var(--line)", overflow:"hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: g.color, transition: "width .3s ease" }}/>
      </div>
      <div className="mono" style={{ fontSize: 10, color:"var(--ink-3)", marginTop: 6 }}>{g.members} sensors</div>
    </div>
  );
}

Object.assign(window, { StudioHeader, RealtimeTab, GroupsTab, FusionTab });
