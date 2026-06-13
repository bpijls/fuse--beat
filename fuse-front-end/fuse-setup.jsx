// fuse-setup.jsx — setup wizard screens

const { useState: useStateS, useEffect: useEffectS, useRef: useRefS } = React;

// ─── Step indicator ──────────────────────────────────────────
function StepDots({ step }) {
  const labels = ["Connect sensor", "Join network", "You're in"];
  return (
    <div className="steps">
      {labels.map((l, i) =>
      <React.Fragment key={i}>
          <div className={"step " + (i === step ? "active" : i < step ? "done" : "")}>
            <span className="num">{i < step ? "✓" : i + 1}</span>
            <span style={{ fontSize: 13 }}>{l}</span>
          </div>
          {i < labels.length - 1 && <span className="step-sep" />}
        </React.Fragment>
      )}
    </div>);

}

// ─── Header for setup ────────────────────────────────────────
function SetupHeader({ step }) {
  return (
    <div className="shell-hd">
      <Wordmark size={26} />
      <StepDots step={step} />
      <div style={{ width: 1 }} />
    </div>);

}

// ─── 0. Welcome ──────────────────────────────────────────────
function WelcomeScreen({ onStart, onSkip }) {
  return (
    <div className="shell">
      <div className="shell-hd">
        <Wordmark size={26} />
        {/* <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tag sage"><span className="dot live" />Studio online</span>
        </div> */}
      </div>
      <div className="setup-stage fade-in" style={{ paddingTop: 24 }}>
        <div style={{ width: "100%", maxWidth: 980, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <div style={{ marginTop: 4 }}>
            <FuseMark size={88} color="var(--pulse)" animate />
          </div>
          <div>
            <h1 className="serif" style={{ fontSize: "clamp(44px, 6.4vw, 76px)", lineHeight: 1.08, letterSpacing: "-0.015em", maxWidth: 820, margin: 0 }}>
              Fuse<span style={{color: "var(--pulse)" }}>!</span> workshop.
            </h1>
          </div>
          <p style={{ fontSize: "clamp(15px, 1.4vw, 18px)", color: "var(--ink-2)", maxWidth: 620, lineHeight: 1.5, margin: 0 }}>
            Signs of life on the dead internet.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button className="btn btn-pulse btn-lg" onClick={onStart}>
              Wake my sensor →
            </button>
            <button className="btn btn-ghost btn-lg">Read the brief</button>
          </div>
          <div style={{ display: "flex", gap: 36, marginTop: 28, color: "var(--ink-3)", fontSize: 13 }}>
            <span>① Plug it in</span>
            <span>② Get on wifi</span>
            <span>③ Find your team</span>
            <span>④ Make something fun</span>
          </div>
          <button
            onClick={onSkip}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink-3)", textDecoration: "underline", padding: 0 }}
          >
            Already set up? Skip to studio →
          </button>
        </div>
      </div>
    </div>);

}

// ─── 1. Firmware (real WebSerial flash via esp-web-tools) ────
function FirmwareScreen({ onNext }) {
  // idle | checking | verified | blocked | failed
  const [phase, setPhase] = useStateS("idle");
  const [deviceMac, setDeviceMac] = useStateS(null);

  const checkSensor = async () => {
    setPhase("checking");
    try {
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      const writer = port.writable.getWriter();
      const reader = port.readable.getReader();

      await writer.write(enc.encode("status\n"));

      let buf = "";
      let mac = null;
      const timeout = setTimeout(() => reader.cancel(), 4000);
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
          const m = buf.match(/\[Serial\] MAC: ([0-9A-Fa-f:]{17})/);
          if (m) { mac = m[1]; break; }
        }
      } catch (_) {}
      clearTimeout(timeout);
      reader.releaseLock();
      writer.releaseLock();
      await port.close();

      if (!mac) { setPhase("failed"); return; }

      // Check whitelist before proceeding
      try {
        const resp = await fetch(`https://whitelist.feib.nl/api/v1/check/${mac}`);
        const data = await resp.json();
        if (!data.whitelisted) { setDeviceMac(mac); setPhase("blocked"); return; }
      } catch (_) { setPhase("failed"); return; }

      setDeviceMac(mac);
      setPhase("verified");
    } catch (err) {
      console.error("[FirmwareScreen] check error:", err);
      setPhase("failed");
    }
  };

  const verified = phase === "verified";
  const blocked  = phase === "blocked";
  const disabled = blocked;

  return (
    <div className="shell">
      <SetupHeader step={0} />
      <div className="setup-stage fade-in">
        <div className="card setup-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Step one</div>
          <h2 className="serif" style={{ fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            Plug your sensor into <span style={{ fontStyle: "italic" }}>this laptop</span>, and let it learn the latest moves.
          </h2>
          <p style={{ color: "var(--ink-2)", fontSize: 16, marginTop: 14, maxWidth: 560 }}>
            Use the white USB-C cable on your bench. We'll talk to it directly through your browser — no installs, no driver wrangling. Requires Chrome or Edge.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 32, alignItems: "stretch", opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? "none" : "auto" }}>
            <div style={{
              borderRadius: 14, border: "1px solid var(--line)", background: "var(--bone-2)",
              padding: 28, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, minHeight: 220
            }}>
              <SensorIllustration connected={verified} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>fuse·node</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>rev. A · ESP32-C3</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="spread">
                <div>
                  <div className="eyebrow">Status</div>
                  <div className="serif" style={{ fontSize: 28, lineHeight: 1.1, marginTop: 4 }}>
                    {verified ? "Sensor is awake" : "Plug in & flash"}
                  </div>
                </div>
                {verified && <span className="tag sage"><span className="dot live" />Ready</span>}
              </div>

              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6, flex: 1 }}>
                {verified
                  ? <span>Sensor confirmed · <span className="mono" style={{ fontSize: 12 }}>{deviceMac}</span></span>
                  : "Click Flash firmware and pick your sensor from the USB device picker. When the progress bar finishes, click Check sensor to confirm it's running."
                }
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <esp-web-install-button manifest="/firmware/manifest.json">
                  <button slot="activate" className="btn btn-pulse">Flash firmware →</button>
                  <span slot="unsupported" style={{ fontSize: 13, color: "var(--pulse)" }}>
                    WebSerial requires Chrome or Edge — other browsers aren't supported.
                  </span>
                </esp-web-install-button>
              </div>

              {!verified && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    className={"btn " + (phase === "checking" ? "btn-ghost" : "btn-secondary")}
                    onClick={checkSensor}
                    disabled={phase === "checking"}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {phase === "checking" ? "Checking…" : phase === "failed" ? "Retry check" : "Check sensor"}
                  </button>
                  {phase === "failed" && (
                    <div style={{ fontSize: 13, color: "var(--pulse)" }}>
                      Sensor didn't respond — make sure it's plugged in and freshly flashed.
                    </div>
                  )}
                </div>
              )}

              {verified && (
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => onNext(deviceMac)}>
                  Continue to network →
                </button>
              )}
            </div>
          </div>

          {blocked && (
            <div style={{
              marginTop: 24, padding: 18, borderRadius: 12,
              background: "rgba(212,74,58,.08)", border: "1px solid rgba(212,74,58,.3)",
              display: "flex", alignItems: "flex-start", gap: 14
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>⊘</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Device not registered</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5 }}>
                  <span className="mono" style={{ fontSize: 12 }}>{deviceMac}</span> is not on the workshop whitelist.
                  Ask an instructor to register this MAC address before continuing.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// little sensor illustration — abstract puck
function SensorIllustration({ connected }) {
  return (
    <svg viewBox="0 0 240 140" width="220" height="130">
      <defs>
        <linearGradient id="puck" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fbf7f0" />
          <stop offset="100%" stopColor="#e4dccd" />
        </linearGradient>
      </defs>
      {/* USB cable */}
      <path d={`M 0 70 C 30 70 40 ${connected ? 70 : 90} 70 70`} fill="none" stroke="#b8a986" strokeWidth="3" strokeLinecap="round" />
      <rect x="68" y="58" width="22" height="24" rx="4" fill="#3a3022" />
      {/* puck */}
      <rect x="90" y="38" width="120" height="64" rx="14" fill="url(#puck)" stroke="#c4b89f" />
      <rect x="90" y="38" width="120" height="64" rx="14" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth=".5" transform="translate(0,1)" />
      {/* heart icon center */}
      <g transform="translate(150,70)">
        <circle r="14" fill="rgba(212,74,58,.08)" stroke="rgba(212,74,58,.3)" />
        <FuseMarkInline x={-10} y={-10} size={20} />
      </g>
      {/* LED */}
      <circle cx="194" cy="50" r="3" fill={connected ? "#6f8b6a" : "#a89a85"}>
        {connected && <animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite" />}
      </circle>
      <text x="100" y="98" fontFamily="Geist Mono, monospace" fontSize="9" fill="#7a6b58">FUSE·NODE</text>
    </svg>);

}
function FuseMarkInline({ x = 0, y = 0, size = 20 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${size / 32})`}>
      <circle cx="11" cy="16" r="7.5" fill="none" stroke="#d44a3a" strokeWidth="1.5" />
      <circle cx="21" cy="16" r="7.5" fill="none" stroke="#d44a3a" strokeWidth="1.5" />
    </g>);

}

// ─── Hue picker ──────────────────────────────────────────────
function hueToHex(h) {
  const l = 0.5, a = Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function HuePicker({ hue, onChange }) {
  const spectrum = "linear-gradient(to right," +
    "hsl(0,100%,50%),hsl(30,100%,50%),hsl(60,100%,50%),hsl(90,100%,50%)," +
    "hsl(120,100%,50%),hsl(150,100%,50%),hsl(180,100%,50%),hsl(210,100%,50%)," +
    "hsl(240,100%,50%),hsl(270,100%,50%),hsl(300,100%,50%),hsl(330,100%,50%),hsl(359,100%,50%))";
  const pct = (hue / 359) * 100;
  return (
    <div style={{ position: "relative", height: 44 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: spectrum, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.1)" }} />
      <input
        type="range" min="0" max="359" value={hue}
        onChange={e => onChange(+e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", margin: 0 }}
      />
      <div style={{
        position: "absolute",
        left: `calc(${pct}% - 12px)`,
        top: "50%", transform: "translateY(-50%)",
        width: 24, height: 24, borderRadius: "50%",
        background: `hsl(${hue},100%,50%)`,
        border: "2.5px solid #fff",
        boxShadow: "0 1px 5px rgba(0,0,0,.35)",
        pointerEvents: "none",
        transition: "left .05s",
      }} />
    </div>
  );
}

// ─── 2. Network ──────────────────────────────────────────────
function NetworkScreen({ mac, wsServer, onNext }) {
  const [ssid, setSsid] = useStateS("iotroam");
  const [pw, setPw] = useStateS("");
  const [sensorName, setSensorName] = useStateS("");
  const [hue, setHue] = useStateS(0);
  const [phase, setPhase] = useStateS("idle"); // idle | submitting | registered
  const [registeredId, setRegisteredId] = useStateS(null);
  const canSubmit = ssid.length > 1 && pw.length > 3 && sensorName.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setPhase("submitting");
    const colorHex = hueToHex(hue);
    try {
      const enc = new TextEncoder();
      const dec = new TextDecoder();

      // Derive device ID from MAC passed in from FirmwareScreen (last 4 hex chars)
      let deviceId = mac ? mac.replace(/:/g, "").slice(-4).toUpperCase() : null;

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      const writer = port.writable.getWriter();

      // If we don't have the device ID yet, read it via status command
      if (!deviceId) {
        const reader = port.readable.getReader();
        await writer.write(enc.encode("status\n"));
        let statusText = "";
        const idTimeout = setTimeout(() => reader.cancel(), 3000);
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            statusText += dec.decode(value);
            if (statusText.includes("[Serial] Device ID: ")) break;
          }
        } catch (_) {}
        clearTimeout(idTimeout);
        reader.releaseLock();
        const idMatch = statusText.match(/\[Serial\] Device ID: ([A-Fa-f0-9]+)/);
        deviceId = idMatch ? idMatch[1] : null;
      }

      // ── Provision WiFi + server URL + color ──────────────
      const serverUrl = wsServer || `ws://${window.location.host}/ws`;
      await writer.write(enc.encode(`wifi ${ssid} ${pw}\n`));
      await new Promise(r => setTimeout(r, 800));
      await writer.write(enc.encode(`server ${serverUrl}\n`));
      await new Promise(r => setTimeout(r, 800));
      await writer.write(enc.encode(`color ${colorHex}\n`));
      await new Promise(r => setTimeout(r, 400));

      writer.releaseLock();
      await port.close();

      // ── Save sensor name + color to server ────────────────
      if (deviceId) {
        await Promise.all([
          sensorName.trim() && fetch(`/devices/${deviceId}/name`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: sensorName.trim() }),
          }).catch(() => {}),
          fetch(`/devices/${deviceId}/color`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ color: colorHex }),
          }).catch(() => {}),
        ]);
        setRegisteredId(deviceId);
      }

      setPhase("registered");
    } catch (err) {
      console.error("[NetworkScreen] provisioning error:", err);
      setPhase("idle");
    }
  };
  return (
    <div className="shell">
      <SetupHeader step={1} />
      <div className="setup-stage fade-in">
        <div className="card setup-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Step two</div>
          <h2 className="serif" style={{ fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            Let your sensor onto the <span style={{ fontStyle: "italic" }}>studio wifi</span>.
          </h2>
          <p style={{ color: "var(--ink-2)", fontSize: 16, marginTop: 14, maxWidth: 620 }}>
            We're piggy-backing on <span className="mono" style={{ fontSize: 14 }}>iotroam</span> for the day. Get your sensor a password there using its MAC address, then drop it in below. (You can swap in your own home wifi later when you take it off-campus.)
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 28, marginTop: 32 }}>
            {/* MAC card */}
            <div style={{
              padding: 20, borderRadius: 14, border: "1px solid var(--line)",
              background: "linear-gradient(180deg, #fbf7f0 0%, #f0e6d4 100%)",
              display: "flex", flexDirection: "column", gap: 14
            }}>
              <div className="eyebrow">Your sensor's address</div>
              <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
                <div className="mono" style={{ fontSize: 17, letterSpacing: ".02em", color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {mac}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => navigator.clipboard && navigator.clipboard.writeText(mac)}>Copy</button>
              </div>
              <div className="divider" />
              <ol style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, display:"flex", flexDirection:"column", gap: 6 }}>
                <li>Open <span className="mono" style={{ background: "var(--bone)", padding: "1px 6px", borderRadius: 4 }}>iotroam.nl</span> and log in</li>
                <li>Add a new device and paste the address above into the <b>MAC</b> field</li>
                <li>Set expiry to <span className="mono" style={{ background: "var(--bone)", padding: "1px 6px", borderRadius: 4 }}>01-08-2026</span></li>
                <li>Copy the password it gives you into the form on the right</li>
              </ol>
            </div>

            {/* form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>Name your sensor</label>
                <input
                  className="input"
                  placeholder="e.g.  Eline's lub-dub"
                  value={sensorName}
                  onChange={(e) => setSensorName(e.target.value)}
                  maxLength={32}
                  style={{ fontSize: 16, height: 48 }}
                />
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>We'll use this to say hi and label your beat in the room view.</div>
              </div>
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Sensor colour
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: `hsl(${hue},100%,50%)`, display: "inline-block", boxShadow: "0 0 0 1.5px rgba(0,0,0,.12)" }} />
                </label>
                <HuePicker hue={hue} onChange={setHue} />
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Pick a hue — this is the colour your heartbeat pulses in the room view.</div>
              </div>
              <div className="field">
                <label>SSID</label>
                <input className="input mono" placeholder="iotroam" value={ssid} onChange={(e) => setSsid(e.target.value)} style={{ fontSize: 16, height: 48 }} />
              </div>
              <div className="field">
                <label>Password from iotroam</label>
                <input className="input mono" type="password" placeholder="paste here" value={pw} onChange={(e) => setPw(e.target.value)} style={{ fontSize: 16, height: 48 }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 2 }}>
                Heading home with your sensor? You can add a second network (e.g. your home wifi) from the <b>Settings</b> menu once you're online.
              </div>

              {phase === "registered" ?
              <div style={{
                marginTop: 4, padding: 14, borderRadius: 10,
                background: "rgba(111,139,106,.1)", border: "1px solid rgba(111,139,106,.3)",
                display: "flex", alignItems: "center", gap: 14
              }}>
                  <span className="dot live" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      {sensorName.trim() && <><b>{sensorName.trim()}</b> · </>}
                      device <span className="mono">{registeredId || "?"}</span> provisioned
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>It's connecting to WiFi and the studio server now.</div>
                  </div>
                  <button className="btn btn-pulse btn-sm" onClick={() => onNext && onNext(sensorName.trim())}>You're in →</button>
                </div> :

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <button className={"btn " + (canSubmit ? "btn-pulse" : "btn-ghost")} onClick={submit} disabled={!canSubmit || phase === "submitting"}>
                    {phase === "submitting" ? "Registering…" : "Register sensor"}
                  </button>
                  <button className="btn btn-ghost btn-sm">Trouble with iotroam?</button>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>);

}

function QRGlyph() {
  // tiny abstract qr-ish pattern
  const cells = "1101011010110100101101110010110100110101101100101101001101101";
  return (
    <svg width="36" height="36" viewBox="0 0 12 12">
      {cells.split("").map((c, i) => c === "1" ?
      <rect key={i} x={i % 12} y={Math.floor(i / 12)} width="1" height="1" fill="var(--ink)" /> :
      null)}
      <rect x="0" y="0" width="3" height="3" fill="none" stroke="var(--ink)" strokeWidth=".4" />
      <rect x="9" y="0" width="3" height="3" fill="none" stroke="var(--ink)" strokeWidth=".4" />
      <rect x="0" y="9" width="3" height="3" fill="none" stroke="var(--ink)" strokeWidth=".4" />
    </svg>);

}

// ─── 3. Ready transition ─────────────────────────────────────
function ReadyScreen({ onEnter, name }) {
  return (
    <div className="shell">
      <SetupHeader step={2} />
      <div className="setup-stage fade-in">
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <PulseOrb size={220} bpm={74} />
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Sensor online</div>
            <h2 className="serif" style={{ fontSize: 72, lineHeight: 1.02, letterSpacing: "-0.01em" }}>
              Hello, <span style={{ fontStyle: "italic", color: "var(--pulse)" }}>{name}</span>. <br />Your pulse is on&nbsp;the air.
            </h2>
            <p style={{ color: "var(--ink-2)", fontSize: 17, marginTop: 14, maxWidth: 560 }}>
              From here on you can see your own beat, find your team, and watch the room as one organism.
            </p>
          </div>
          <button className="btn btn-pulse btn-lg" onClick={onEnter}>Enter the studio →</button>
        </div>
      </div>
    </div>);

}

Object.assign(window, { WelcomeScreen, FirmwareScreen, NetworkScreen, ReadyScreen });