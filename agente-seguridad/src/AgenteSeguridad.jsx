import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const DEFAULT_KEYWORDS = [
  "auxilio","ayuda","socorro","peligro","suéltame","sueltame",
  "no me toques","help","para","déjame","dejame","llamen","policia","policía"
];

const DEFAULT_CONTACTS = [
  { name: "Mamá",    phone: "+591 7XX-XXXX", active: true  },
  { name: "Papá",    phone: "+591 6XX-XXXX", active: true  },
  { name: "Amigo/a", phone: "+591 7XX-XXXX", active: false },
];

const RISK_COLOR = { alto: "#e63950", medio: "#f5a623", bajo: "#27c97a" };
const RISK_BG    = { alto: "rgba(230,57,80,0.12)", medio: "rgba(245,166,35,0.12)", bajo: "rgba(39,201,122,0.12)" };

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const getInitials = name => {
  if (!name || name === "Conductor no identificado") return "?";
  const w = name.trim().split(" ");
  return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
};

/* ─────────────────────────────────────────────
   GLOBAL STYLES (injected once)
───────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #08090c; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a2d35; border-radius: 2px; }
  input::placeholder { color: #35383f; }
  input:focus { outline: none; }

  @keyframes sos-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(230,57,80,0.7); }
    60%  { box-shadow: 0 0 0 18px rgba(230,57,80,0); }
    100% { box-shadow: 0 0 0 0 rgba(230,57,80,0); }
  }
  @keyframes status-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
  @keyframes scan-line {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(400%); }
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes bar-grow {
    from { transform: scaleY(0.3); }
    to   { transform: scaleY(1); }
  }
`;

/* ─────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────── */
const T = {
  bg:       "#08090c",
  surface:  "#0e1016",
  panel:    "#11131a",
  border:   "#1c1f28",
  borderHi: "#2e3240",
  text:     "#d4d8e2",
  textDim:  "#5a5f6e",
  textMid:  "#8b909e",
  accent:   "#e63950",
  accentLo: "rgba(230,57,80,0.15)",
  green:    "#27c97a",
  greenLo:  "rgba(39,201,122,0.1)",
  amber:    "#f5a623",
  blue:     "#4d9de0",
  blueLo:   "rgba(77,157,224,0.1)",
  font:     "'Rajdhani', sans-serif",
  mono:     "'Share Tech Mono', monospace",
};

/* ─────────────────────────────────────────────
   MICRO-COMPONENTS
───────────────────────────────────────────── */
const Label = ({ children, style }) => (
  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.18em", color: T.textDim, marginBottom: 10, textTransform: "uppercase", ...style }}>
    {children}
  </div>
);

const Pill = ({ children, color = T.green, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em",
    padding: "3px 10px", borderRadius: 3,
    background: bg || `${color}18`, color, border: `1px solid ${color}35`,
  }}>
    {children}
  </span>
);

const TacticalInput = ({ value, onChange, placeholder, style }) => (
  <input
    value={value} onChange={onChange} placeholder={placeholder}
    style={{
      width: "100%", padding: "9px 12px",
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, color: T.text,
      fontFamily: T.mono, fontSize: 12,
      transition: "border-color 0.2s",
      ...style,
    }}
    onFocus={e => e.target.style.borderColor = T.borderHi}
    onBlur={e => e.target.style.borderColor = T.border}
  />
);

/* Divider with optional label */
const Divider = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
    <div style={{ flex: 1, height: 1, background: T.border }} />
    {label && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: "0.15em" }}>{label}</span>}
    <div style={{ flex: 1, height: 1, background: T.border }} />
  </div>
);

/* ─────────────────────────────────────────────
   CONFIG SCREEN
───────────────────────────────────────────── */
function ConfigScreen({ contacts, myName, snsEndpoint, onSave, onBack }) {
  const [localContacts, setLocalContacts] = useState(contacts.map(c => ({ ...c })));
  const [localName, setLocalName]         = useState(myName);
  const [localSns,  setLocalSns]          = useState(snsEndpoint);

  const updateContact = (i, field, val) =>
    setLocalContacts(prev => prev.map((c, j) => j === i ? { ...c, [field]: val } : c));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 28px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 3, color: T.textMid, fontSize: 12, fontFamily: T.mono, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.1em", transition: "border-color 0.2s, color 0.2s" }}
          onMouseEnter={e => { e.target.style.borderColor = T.borderHi; e.target.style.color = T.text; }}
          onMouseLeave={e => { e.target.style.borderColor = T.border;   e.target.style.color = T.textMid; }}
        >
          ← VOLVER
        </button>
        <Label style={{ marginBottom: 0 }}>CONFIGURACIÓN DEL SISTEMA</Label>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, maxWidth: 960, width: "100%", margin: "0 auto", padding: "32px 28px" }}>
        {/* Left */}
        <div style={{ paddingRight: 28, borderRight: `1px solid ${T.border}` }}>
          <Label>Identificación del pasajero</Label>
          <TacticalInput value={localName} onChange={e => setLocalName(e.target.value)} placeholder="Tu nombre completo" />

          <Divider />

          <Label>Endpoint AWS SNS</Label>
          <TacticalInput
            value={localSns} onChange={e => setLocalSns(e.target.value)}
            placeholder="https://xxx.execute-api.amazonaws.com/prod/alert"
            style={{ fontSize: 11 }}
          />
          <p style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginTop: 8, lineHeight: 1.8 }}>
            Sin endpoint configurado, los SMS se ejecutan en modo simulado — el log muestra el mensaje pero no hay envío real.
          </p>
        </div>

        {/* Right */}
        <div style={{ paddingLeft: 28 }}>
          <Label>Contactos de emergencia</Label>
          {localContacts.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <TacticalInput value={c.name}  onChange={e => updateContact(i, "name",  e.target.value)} placeholder="Nombre" style={{ flex: "0 0 110px" }} />
              <TacticalInput value={c.phone} onChange={e => updateContact(i, "phone", e.target.value)} placeholder="+591XXXXXXXXX" />
              <button
                onClick={() => updateContact(i, "active", !c.active)}
                style={{ padding: "9px 12px", background: c.active ? T.greenLo : T.surface, border: `1px solid ${c.active ? T.green : T.border}`, borderRadius: 3, color: c.active ? T.green : T.textDim, fontFamily: T.mono, fontSize: 10, cursor: "pointer", letterSpacing: "0.1em", flexShrink: 0, transition: "all 0.2s" }}
              >
                {c.active ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => setLocalContacts(prev => prev.filter((_, j) => j !== i))}
                style={{ padding: "9px 10px", background: T.accentLo, border: `1px solid ${T.accent}30`, borderRadius: 3, color: T.accent, fontFamily: T.mono, fontSize: 11, cursor: "pointer", flexShrink: 0 }}
              >✕</button>
            </div>
          ))}

          <button
            onClick={() => setLocalContacts(prev => [...prev, { name: "", phone: "", active: true }])}
            style={{ width: "100%", padding: 10, background: "none", border: `1px dashed ${T.border}`, borderRadius: 3, color: T.textDim, fontFamily: T.mono, fontSize: 11, cursor: "pointer", letterSpacing: "0.1em", marginBottom: 20, transition: "all 0.2s" }}
            onMouseEnter={e => { e.target.style.borderColor = T.borderHi; e.target.style.color = T.text; }}
            onMouseLeave={e => { e.target.style.borderColor = T.border;   e.target.style.color = T.textDim; }}
          >+ AGREGAR CONTACTO</button>

          <button
            onClick={() => onSave(localContacts, localName, localSns)}
            style={{ width: "100%", padding: 14, background: T.accentLo, border: `1px solid ${T.accent}60`, borderRadius: 3, color: T.accent, fontFamily: T.mono, fontSize: 12, cursor: "pointer", letterSpacing: "0.18em", transition: "all 0.2s" }}
            onMouseEnter={e => { e.target.style.background = `rgba(230,57,80,0.22)`; }}
            onMouseLeave={e => { e.target.style.background = T.accentLo; }}
          >GUARDAR Y VOLVER</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function AgenteSeguridad({ conductorNFC, placaNFC }) {
  // Inject fonts/keyframes once
  useEffect(() => {
    const id = "taxi-global-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id; s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // Read URL params (bypass)
  const params      = new URLSearchParams(window.location.search);
  const nombreFinal = params.get("conductorNFC") || params.get("conductor") || conductorNFC || "Conductor no identificado";
  const placaFinal  = params.get("placaNFC")     || params.get("placa")     || placaNFC     || "Placa desconocida";

  const DRIVER = {
    name:     nombreFinal,
    plate:    placaFinal,
    rating:   4.2,
    trips:    1247,
    verified: nombreFinal !== "Conductor no identificado",
  };

  /* ── State ── */
  const [screen,         setScreen]         = useState("main");
  const [isActive,       setIsActive]       = useState(false);
  const [transcript,     setTranscript]     = useState([]);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [alertDetails,   setAlertDetails]   = useState(null);
  const [aiAnalysis,     setAiAnalysis]     = useState(null);
  const [isAnalyzing,    setIsAnalyzing]    = useState(false);
  const [tripTime,       setTripTime]       = useState(0);
  const [detectedKw,     setDetectedKw]     = useState(null);
  const [micLevel,       setMicLevel]       = useState(0);
  const [snsLog,         setSnsLog]         = useState([]);
  const [contacts,       setContacts]       = useState(DEFAULT_CONTACTS);
  const [myName,         setMyName]         = useState("Pasajero");
  const [snsEndpoint,    setSnsEndpoint]    = useState("");

  /* ── Refs ── */
  const recognitionRef  = useRef(null);
  const timerRef        = useRef(null);
  const audioCtxRef     = useRef(null);
  const analyserRef     = useRef(null);
  const micStreamRef    = useRef(null);
  const animFrameRef    = useRef(null);
  const transcriptRef   = useRef([]);
  const alertedRef      = useRef(false);
  const isListeningRef  = useRef(false);
  const myNameRef       = useRef(myName);
  const contactsRef     = useRef(contacts);
  const snsEndpointRef  = useRef(snsEndpoint);

  // Keep refs in sync with state (fixes stale-closure bugs)
  useEffect(() => { myNameRef.current      = myName;      }, [myName]);
  useEffect(() => { contactsRef.current    = contacts;    }, [contacts]);
  useEffect(() => { snsEndpointRef.current = snsEndpoint; }, [snsEndpoint]);

  /* ── Trip timer ── */
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => setTripTime(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive]);

  /* ── Mic level visualizer ── */
  const startMicLevel = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      // Reuse existing AudioContext if possible to avoid "closed" state error
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      analyserRef.current = audioCtxRef.current.createAnalyser();
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, avg * 2.5));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn("Micrófono no disponible:", e);
    }
  }, []);

  const stopMicLevel = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    analyserRef.current  = null;
    // Close AudioContext properly
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  /* ── Keyword check ── */
  const checkKeywords = useCallback(text => {
    const l = text.toLowerCase();
    for (const kw of DEFAULT_KEYWORDS) if (l.includes(kw)) return kw;
    return null;
  }, []);

  /* ── Alert sender — uses refs to avoid stale closures ── */
  const sendAlerts = useCallback(async (reason, location) => {
    const active  = contactsRef.current.filter(c => c.active);
    const message =
`🚨 ALERTA DE SEGURIDAD
👤 ${myNameRef.current} necesita ayuda
📍 ${location}
🚗 Taxi ${DRIVER.plate} | ${DRIVER.name}
⏰ ${new Date().toLocaleTimeString()}
📋 ${reason}
[Agente Taxi Seguro]`;

    for (const c of active) {
      if (snsEndpointRef.current) {
        try {
          const r = await fetch(snsEndpointRef.current, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: c.phone, message }),
          });
          setSnsLog(p => [...p, { contact: c.name, ok: r.ok, time: new Date().toLocaleTimeString(), text: r.ok ? `SMS enviado a ${c.name}` : `Error con ${c.name}` }]);
        } catch {
          setSnsLog(p => [...p, { contact: c.name, ok: false, time: new Date().toLocaleTimeString(), text: `Sin conexión — ${c.name}` }]);
        }
      } else {
        setSnsLog(p => [...p, { contact: c.name, ok: true, sim: true, time: new Date().toLocaleTimeString(), text: `[SIM] SMS a ${c.name} (${c.phone})`, message }]);
      }
    }
  }, [DRIVER.plate, DRIVER.name]);

  /* ── Trigger alert (idempotent) ── */
  const triggerAlert = useCallback((reason, text) => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    setAlertTriggered(true);
    const location = "Sucre, Bolivia (GPS activo)";
    setAlertDetails({ reason, text, time: new Date().toLocaleTimeString(), location });
    sendAlerts(reason, location);
  }, [sendAlerts]);

  /* ── AI analysis ── */
  const analyzeWithAI = useCallback(async text => {
    if (isAnalyzing) return; // prevent concurrent calls
    setIsAnalyzing(true);
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          system: `Eres un agente de seguridad para pasajeros de taxi. Analiza el texto transcrito y determina si hay señales de peligro, angustia o coerción. Responde SOLO con JSON sin markdown: {"riesgo":"alto|medio|bajo","razon":"texto corto max 60 chars","accion":"alerta|monitorear|normal"}`,
          messages: [{ role: "user", content: `Audio en taxi: "${text}"` }],
        }),
      });
      const data = await res.json();
      const raw  = data.content?.[0]?.text || "{}";
      const obj  = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setAiAnalysis(obj);
      if (obj.accion === "alerta" && !alertedRef.current)
        triggerAlert("IA detectó riesgo: " + obj.razon, text);
    } catch {
      setAiAnalysis({ riesgo: "bajo", razon: "Sin conexión con IA", accion: "normal" });
    }
    setIsAnalyzing(false);
  }, [isAnalyzing, triggerAlert]);

  /* ── Speech recognition ── */
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Usa Chrome para reconocimiento de voz."); return; }

    const rec     = new SR();
    rec.lang      = "es-ES";
    rec.continuous      = true;
    rec.interimResults  = true;

    rec.onresult = e => {
      const latest = Array.from(e.results).map(r => r[0].transcript).join(" ");

      if (latest.toLowerCase().includes("viaje terminado")) {
        // Defer stop to avoid calling setState inside event handler
        setTimeout(handleStop, 0);
        return;
      }

      const entry   = { text: latest, time: new Date().toLocaleTimeString(), id: Date.now() };
      const updated = [...transcriptRef.current.slice(-10), entry];
      transcriptRef.current = updated;
      setTranscript([...updated]);

      const kw = checkKeywords(latest);
      if (kw && !alertedRef.current) {
        setDetectedKw(kw);
        triggerAlert(`Keyword: "${kw}"`, latest);
      }
      if (updated.length % 3 === 0)
        analyzeWithAI(updated.slice(-3).map(t => t.text).join(". "));
    };

    rec.onerror = () => {};
    rec.onend   = () => { if (isListeningRef.current) { try { rec.start(); } catch {} } };

    recognitionRef.current = rec;
    rec.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKeywords, triggerAlert, analyzeWithAI]);

  /* ── Start / Stop ── */
  const handleStart = useCallback(async () => {
    alertedRef.current     = false;
    isListeningRef.current = true;
    setIsActive(true);
    setAlertTriggered(false);
    setAlertDetails(null);
    setTranscript([]);
    transcriptRef.current = [];
    setSnsLog([]);
    setDetectedKw(null);
    setAiAnalysis(null);
    setTripTime(0);

    await startMicLevel();
    startListening();

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => console.log("GPS:", pos.coords.latitude, pos.coords.longitude),
        err => console.warn("GPS error:", err.message)
      );
    }
  }, [startMicLevel, startListening]);

  const handleStop = useCallback(() => {
    isListeningRef.current = false;
    setIsActive(false);
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    stopMicLevel();
  }, [stopMicLevel]);

  /* ── Config save ── */
  const handleConfigSave = useCallback((newContacts, newName, newSns) => {
    setContacts(newContacts);
    setMyName(newName);
    setSnsEndpoint(newSns);
    setScreen("main");
  }, []);

  /* ══════════════════════════════════════════
     CONFIG SCREEN
  ══════════════════════════════════════════ */
  if (screen === "config") {
    return (
      <ConfigScreen
        contacts={contacts}
        myName={myName}
        snsEndpoint={snsEndpoint}
        onSave={handleConfigSave}
        onBack={() => setScreen("main")}
      />
    );
  }

  /* ══════════════════════════════════════════
     MAIN DASHBOARD
  ══════════════════════════════════════════ */
  const riskColor = aiAnalysis ? RISK_COLOR[aiAnalysis.riesgo] : null;

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: T.bg, fontFamily: T.font, color: T.text,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* ══ TOP BAR ══ */}
      <div style={{
        flexShrink: 0,
        background: alertTriggered ? "rgba(230,57,80,0.06)" : T.surface,
        borderBottom: `1px solid ${alertTriggered ? T.accent : T.border}`,
        padding: "0 28px",
        height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all 0.4s",
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Status dot */}
          <div style={{
            width: 9, height: 9, borderRadius: "50%",
            background: isActive ? (alertTriggered ? T.accent : T.green) : "#2a2d35",
            boxShadow: isActive ? `0 0 0 0 ${alertTriggered ? T.accent : T.green}` : "none",
            animation: isActive ? (alertTriggered ? "sos-pulse 1.2s infinite" : "none") : "none",
            transition: "background 0.4s",
          }} />
          <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: "0.2em", color: T.textDim }}>
            TAXI·SEGURO / AGENTE·v2
          </span>
          {isActive && (
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.green, marginLeft: 4 }}>
              {fmt(tripTime)}
            </span>
          )}
        </div>
        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {alertTriggered && (
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, animation: "status-blink 0.9s infinite", letterSpacing: "0.1em" }}>
              ● ALERTA ACTIVA
            </span>
          )}
          <button
            onClick={() => setScreen("config")}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 3, color: T.textDim, fontFamily: T.mono, fontSize: 10, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.12em", transition: "all 0.2s" }}
            onMouseEnter={e => { e.target.style.borderColor = T.borderHi; e.target.style.color = T.text; }}
            onMouseLeave={e => { e.target.style.borderColor = T.border;   e.target.style.color = T.textDim; }}
          >
            ⚙ CONFIG
          </button>
        </div>
      </div>

      {/* ══ ALERT BANNER ══ */}
      {alertTriggered && alertDetails && (
        <div style={{
          flexShrink: 0,
          background: "rgba(230,57,80,0.08)",
          borderBottom: `1px solid rgba(230,57,80,0.25)`,
          padding: "10px 28px",
          display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
          animation: "slide-in 0.3s ease",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.accent, letterSpacing: "0.05em" }}>
              🚨 {alertDetails.reason}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginTop: 3 }}>
              {alertDetails.location} · {alertDetails.time}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {snsLog.map((l, i) => (
              <Pill key={i} color={l.ok ? T.green : T.accent}>
                {l.ok ? "✓" : "✗"} {l.contact}{l.sim ? " sim" : ""}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {/* ══ BODY GRID ══ */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "clamp(240px, 22%, 300px) 1fr clamp(220px, 20%, 280px)",
        overflow: "hidden",
        minWidth: 0,
      }}>

        {/* ── COL 1: Driver + Contacts ── */}
        <div style={{ borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* Driver */}
          <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${T.border}` }}>
            <Label>Conductor</Label>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 3, flexShrink: 0,
                background: "linear-gradient(135deg, #131626, #1e2240)",
                border: `1px solid ${T.borderHi}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.blue,
              }}>
                {getInitials(DRIVER.name)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.03em" }}>{DRIVER.name}</div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginTop: 3 }}>{DRIVER.plate}</div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim }}>{DRIVER.trips.toLocaleString()} viajes</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: 3, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.amber }}>★ {DRIVER.rating}</div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, marginTop: 2 }}>RATING</div>
              </div>
              {DRIVER.verified && (
                <div style={{ flex: 1, background: T.greenLo, border: `1px solid ${T.green}30`, borderRadius: 3, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, color: T.green }}>✓</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, marginTop: 2 }}>NFC·VER</div>
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          <div style={{ padding: "16px 20px", flex: 1 }}>
            <Label>Contactos de emergencia</Label>
            {contacts.map((c, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", marginBottom: 8,
                background: T.surface, borderRadius: 3,
                border: `1px solid ${c.active ? T.borderHi : T.border}`,
                opacity: c.active ? 1 : 0.45, transition: "opacity 0.3s",
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 3, background: T.panel, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim }}>{c.phone}</div>
                </div>
                <Pill color={c.active ? T.green : T.textDim}>{c.active ? "ON" : "OFF"}</Pill>
              </div>
            ))}
            <button
              onClick={() => setScreen("config")}
              style={{ width: "100%", padding: "8px", background: "none", border: `1px dashed ${T.border}`, borderRadius: 3, color: T.textDim, fontFamily: T.mono, fontSize: 10, cursor: "pointer", letterSpacing: "0.12em", transition: "all 0.2s", marginTop: 4 }}
              onMouseEnter={e => { e.target.style.borderColor = T.borderHi; e.target.style.color = T.text; }}
              onMouseLeave={e => { e.target.style.borderColor = T.border;   e.target.style.color = T.textDim; }}
            >✎ EDITAR CONTACTOS</button>
          </div>
        </div>

        {/* ── COL 2: Transcript + AI + Controls ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* AI bar */}
          <div style={{
            flexShrink: 0,
            padding: "12px 24px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", gap: 14,
            background: aiAnalysis ? `${RISK_BG[aiAnalysis.riesgo]}` : T.surface,
            transition: "background 0.5s",
            minHeight: 48,
          }}>
            <Label style={{ marginBottom: 0, flexShrink: 0 }}>Análisis IA</Label>
            {isAnalyzing ? (
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.blue, animation: "status-blink 0.8s infinite" }}>⟳ PROCESANDO</span>
            ) : aiAnalysis ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Pill color={riskColor} bg={RISK_BG[aiAnalysis.riesgo]}>
                  ● RIESGO {aiAnalysis.riesgo?.toUpperCase()}
                </Pill>
                <span style={{ fontSize: 13, color: T.textMid }}>{aiAnalysis.razon}</span>
              </div>
            ) : (
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim }}>
                {isActive ? "Esperando audio..." : "Inicia el monitoreo para activar el agente IA"}
              </span>
            )}
          </div>

          {/* Transcript area */}
          <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
            <Label>Transcripción en vivo</Label>
            {transcript.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: T.borderHi }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>🎙</div>
                <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim }}>
                  {isActive ? "Habla cerca del micrófono..." : "Presiona INICIAR para activar el monitoreo"}
                </div>
              </div>
            ) : (
              transcript.map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    padding: "10px 14px", marginBottom: 8,
                    background: i === transcript.length - 1 ? "rgba(77,157,224,0.05)" : T.surface,
                    borderRadius: 3,
                    borderLeft: `2px solid ${i === transcript.length - 1 ? T.blue : T.border}`,
                    opacity: 0.4 + (i / Math.max(transcript.length - 1, 1)) * 0.6,
                    animation: i === transcript.length - 1 ? "fade-in 0.3s ease" : "none",
                    transition: "opacity 0.3s",
                  }}
                >
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, marginBottom: 5 }}>{t.time}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: T.text }}>{t.text}</div>
                </div>
              ))
            )}
          </div>

          {/* Controls */}
          <div style={{ flexShrink: 0, padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
            {!isActive ? (
              <button
                onClick={handleStart}
                style={{
                  flex: 1, padding: 14,
                  background: T.greenLo, border: `1px solid ${T.green}50`,
                  borderRadius: 3, color: T.green,
                  fontFamily: T.mono, fontSize: 12, letterSpacing: "0.18em",
                  cursor: "pointer", fontWeight: "bold", transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.target.style.background = "rgba(39,201,122,0.18)"; }}
                onMouseLeave={e => { e.target.style.background = T.greenLo; }}
              >
                ▶ INICIAR MONITOREO DE VIAJE
              </button>
            ) : (
              <>
                <button
                  onClick={handleStop}
                  style={{ flex: 1, padding: 13, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, color: T.textMid, fontFamily: T.mono, fontSize: 11, cursor: "pointer", letterSpacing: "0.12em", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.target.style.borderColor = T.borderHi; e.target.style.color = T.text; }}
                  onMouseLeave={e => { e.target.style.borderColor = T.border;   e.target.style.color = T.textMid; }}
                >■ TERMINAR VIAJE</button>
                {!alertTriggered && (
                  <button
                    onClick={() => triggerAlert("SOS Manual activado", "")}
                    style={{
                      padding: "13px 28px",
                      background: T.accentLo, border: `2px solid ${T.accent}`,
                      borderRadius: 3, color: T.accent,
                      fontFamily: T.mono, fontSize: 14, cursor: "pointer",
                      fontWeight: "bold", letterSpacing: "0.12em",
                      animation: "sos-pulse 2s infinite",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={e => { e.target.style.background = "rgba(230,57,80,0.25)"; }}
                    onMouseLeave={e => { e.target.style.background = T.accentLo; }}
                  >🚨 SOS</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── COL 3: Mic + Keywords + SMS Log ── */}
        <div style={{ borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Mic visualizer */}
          <div style={{ flexShrink: 0, padding: "16px 18px", borderBottom: `1px solid ${T.border}` }}>
            <Label>Nivel de audio</Label>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 44, marginBottom: 10 }}>
              {Array.from({ length: 24 }).map((_, i) => {
                const active = (micLevel / 100) * 24 > i;
                const clr    = micLevel > 70 ? T.accent : micLevel > 40 ? T.amber : T.green;
                const h      = 20 + Math.sin(i * 0.9 + Date.now() * 0.001) * 12;
                return (
                  <div key={i} style={{
                    flex: 1, minHeight: 3, borderRadius: 2,
                    background: active ? clr : T.border,
                    height: `${active ? Math.max(20, h) : 15}%`,
                    transition: "background 0.08s, height 0.12s",
                    boxShadow: active ? `0 0 4px ${clr}50` : "none",
                  }} />
                );
              })}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: isActive ? T.green : T.textDim, textAlign: "center", letterSpacing: "0.1em" }}>
              {isActive ? (micLevel < 5 ? "SILENCIO" : "● ESCUCHANDO") : "INACTIVO"}
            </div>
            {detectedKw && (
              <div style={{ marginTop: 10, padding: "7px 10px", background: T.accentLo, border: `1px solid ${T.accent}35`, borderRadius: 3, fontFamily: T.mono, fontSize: 10, color: T.accent, textAlign: "center", animation: "slide-in 0.3s ease" }}>
                ⚡ "{detectedKw}" detectada
              </div>
            )}
          </div>

          {/* Keywords */}
          <div style={{ flexShrink: 0, padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
            <Label>Keywords activas</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {DEFAULT_KEYWORDS.map(kw => (
                <div
                  key={kw}
                  style={{
                    padding: "3px 9px", borderRadius: 3,
                    background: detectedKw === kw ? T.accentLo : T.surface,
                    border: `1px solid ${detectedKw === kw ? T.accent : T.border}`,
                    color: detectedKw === kw ? T.accent : T.textDim,
                    fontFamily: T.mono, fontSize: 9, letterSpacing: "0.05em",
                    transition: "all 0.2s",
                  }}
                >{kw}</div>
              ))}
            </div>
          </div>

          {/* SMS Log */}
          <div style={{ flex: 1, padding: "14px 18px", overflowY: "auto" }}>
            <Label>SMS Log</Label>
            {snsLog.length === 0 ? (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.borderHi, textAlign: "center", paddingTop: 16 }}>SIN ACTIVIDAD</div>
            ) : (
              snsLog.map((l, i) => (
                <div
                  key={i}
                  style={{
                    padding: "9px 11px", marginBottom: 8,
                    background: l.ok ? T.greenLo : T.accentLo,
                    border: `1px solid ${l.ok ? T.green : T.accent}30`,
                    borderRadius: 3, animation: "fade-in 0.3s ease",
                  }}
                >
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: l.ok ? T.green : T.accent }}>
                    {l.text}
                  </div>
                  {l.sim && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, marginTop: 3 }}>modo simulado</div>}
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textDim, marginTop: 2 }}>{l.time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
