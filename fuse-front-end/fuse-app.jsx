// fuse-app.jsx — top-level app with screen routing and tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "intensity": 1,
  "simSpeed": "normal",
  "fusionView": "orbits",
  "startScreen": "welcome"
}/*EDITMODE-END*/;

const SCREENS = ["welcome", "firmware", "network", "ready", "studio"];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState(t.startScreen || "welcome");
  const [tab, setTab] = React.useState("realtime");
  const [joinedId, setJoinedId] = React.useState(null);
  const [sensorName, setSensorName] = React.useState("");
  const [deviceMac, setDeviceMac] = React.useState(null);
  const [wsServer, setWsServer] = React.useState(null);
  const socket = useFuseSocket();

  React.useEffect(() => {
    fetch("/config").then(r => r.json()).then(d => setWsServer(d.ws_server)).catch(() => {});
  }, []);

  // "Me" — a stable participant for this session
  const me = React.useMemo(() => {
    const all = makeParticipants(80, 42);
    return all[7]; // arbitrary "you"
  }, []);

  const { bpm } = useHeartbeat({ baseBpm: me.baseBpm, intensity: intensityToNumber(t.simSpeed) });

  // honor tweak start screen
  React.useEffect(() => {
    if (t.startScreen && t.startScreen !== screen) setScreen(t.startScreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.startScreen]);

  const goTo = (s) => { setScreen(s); setTweak('startScreen', s); };

  const joinedGroupName = React.useMemo(() => {
    if (!joinedId) return null;
    const all = [
      { id: "g1", name: "kitchen kappa" }, { id: "g2", name: "slow burn" },
      { id: "g3", name: "lub-dub" }, { id: "g4", name: "weather front" }, { id: "g5", name: "north star" }
    ];
    return (all.find(g => g.id === joinedId) || {}).name || "new group";
  }, [joinedId]);

  return (
    <>
      {screen === "welcome"  && <WelcomeScreen  onStart={() => goTo("firmware")} onSkip={() => goTo("studio")} />}
      {screen === "firmware" && <FirmwareScreen onNext={(mac) => { setDeviceMac(mac); goTo("network"); }} />}
      {screen === "network"  && <NetworkScreen  mac={deviceMac || me.mac} wsServer={wsServer} onNext={(nm) => { setSensorName(nm && nm.trim()); goTo("ready"); }} />}
      {screen === "ready"    && <ReadyScreen    name={sensorName || me.name} onEnter={() => goTo("studio")} />}
      {screen === "studio"   && (
        <div className="shell fade-in">
          <StudioHeader tab={tab} setTab={setTab} me={me} bpm={bpm} onReprovision={() => goTo("firmware")} wsConnected={socket.connected} />
          {tab === "realtime" && <RealtimeTab me={me} intensity={intensityToNumber(t.simSpeed)} />}
          {tab === "groups"   && <GroupsTab me={me} joinedId={joinedId} setJoinedId={setJoinedId} socket={socket} />}
          {tab === "fusion"   && <FusionTab me={me} viewMode={t.fusionView} intensity={intensityToNumber(t.simSpeed)} joinedGroupName={joinedGroupName} socket={socket} />}
        </div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Navigation" />
        <TweakSelect
          label="Jump to screen"
          value={screen}
          options={[
            { value: "welcome",  label: "1 · Welcome" },
            { value: "firmware", label: "2 · Connect sensor" },
            { value: "network",  label: "3 · Join network" },
            { value: "ready",    label: "4 · You're in" },
            { value: "studio",   label: "5 · Studio (tabs)" },
          ]}
          onChange={(v) => goTo(v)}
        />
        {screen === "studio" && (
          <TweakRadio
            label="Active tab"
            value={tab}
            options={["realtime", "groups", "fusion"]}
            onChange={setTab}
          />
        )}

        <TweakSection label="Simulation" />
        <TweakRadio
          label="Pulse tempo"
          value={t.simSpeed}
          options={["calm", "normal", "buzzing"]}
          onChange={(v) => setTweak('simSpeed', v)}
        />
        <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
          Affects how chaotic the simulated room feels — handy to demo when energy is low.
        </div>

        <TweakSection label="Fusion view" />
        <TweakRadio
          label="Style"
          value={t.fusionView}
          options={["orbits", "field"]}
          onChange={(v) => setTweak('fusionView', v)}
        />
      </TweaksPanel>
    </>
  );
}

function intensityToNumber(s) {
  return s === "calm" ? 0.65 : s === "buzzing" ? 1.6 : 1.0;
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
