import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const pulsingIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#7b7bff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(123,123,255,0.3);animation:mapPulse 1.5s infinite;"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
});

const alertIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#ff2d55;border:3px solid #fff;box-shadow:0 0 0 8px rgba(255,45,85,0.4);animation:mapPulse 0.8s infinite;"></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, map.getZoom(), { duration: 1.2 }); }, [center, map]);
  return null;
}

const DEFAULT_KEYWORDS = ["auxilio","ayuda","socorro","peligro","suéltame","sueltame","no me toques","help","para","déjame","dejame","llamen","policia","policía"];
const DEFAULT_CONTACTS = [
  { name: "Mamá",    phone: "+591 7XX-XXXX", active: true  },
  { name: "Papá",    phone: "+591 6XX-XXXX", active: true  },
  { name: "Amigo/a", phone: "+591 7XX-XXXX", active: false },
];
const DRIVER = { name: "Carlos Mendoza", plate: "3456-BOL", rating: 4.2, trips: 1247, verified: true };
const RC = { alto:"#ff2d55", medio:"#ff9500", bajo:"#30d158" };

export default function AgenteSeguridad() {
  const [screen, setScreen]                 = useState("main");
  const [isActive, setIsActive]             = useState(false);
  const [transcript, setTranscript]         = useState([]);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [alertDetails, setAlertDetails]     = useState(null);
  const [aiAnalysis, setAiAnalysis]         = useState(null);
  const [isAnalyzing, setIsAnalyzing]       = useState(false);
  const [tripTime, setTripTime]             = useState(0);
  const [detectedKw, setDetectedKw]         = useState(null);
  const [micLevel, setMicLevel]             = useState(0);
  const [snsLog, setSnsLog]                 = useState([]);
  const [contacts, setContacts]             = useState(DEFAULT_CONTACTS);
  const [myName, setMyName]                 = useState("Pasajero");
  const [snsEndpoint, setSnsEndpoint]       = useState("");
  const [editContacts, setEditContacts]     = useState(null);
  const [userPos, setUserPos]               = useState(null);
  const [accuracy, setAccuracy]             = useState(null);
  const [gpsError, setGpsError]             = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);

  const recognitionRef = useRef(null);
  const timerRef       = useRef(null);
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const micStreamRef   = useRef(null);
  const animFrameRef   = useRef(null);
  const transcriptRef  = useRef([]);
  const alertedRef     = useRef(false);
  const watchIdRef     = useRef(null);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError("Geolocalización no disponible"); return; }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        setAccuracy(Math.round(pos.coords.accuracy));
        setGpsError(null);
        setLocationHistory(h => [...h.slice(-49), coords]);
      },
      (err) => setGpsError("Sin señal GPS"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  // Timer
  useEffect(() => {
    if (isActive) timerRef.current = setInterval(() => setTripTime(t => t+1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [isActive]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const startMicLevel = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioCtxRef.current  = new AudioContext();
      analyserRef.current  = audioCtxRef.current.createAnalyser();
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      const tick = () => {
        analyserRef.current.getByteFrequencyData(data);
        setMicLevel(Math.min(100, (data.reduce((a,b)=>a+b,0)/data.length)*2.5));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch(e) { console.warn("Mic no disponible", e); }
  };

  const stopMicLevel = () => {
    cancelAnimationFrame(animFrameRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(()=>{});
    setMicLevel(0);
  };

  const checkKeywords = useCallback(text => {
    const l = text.toLowerCase();
    for (const kw of DEFAULT_KEYWORDS) if (l.includes(kw)) return kw;
    return null;
  }, []);

  const analyzeWithAI = async text => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          system: `Eres un agente de seguridad para pasajeros de taxi. Analiza el texto transcrito y determina si hay señales de peligro, angustia o coerción. Responde SOLO con JSON sin markdown: {"riesgo":"alto|medio|bajo","razon":"texto corto","accion":"alerta|monitorear|normal"}`,
          messages: [{ role:"user", content:`Audio en taxi: "${text}"` }]
        })
      });
      const data = await res.json();
      const raw  = data.content?.[0]?.text || "{}";
      const obj  = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setAiAnalysis(obj);
      if (obj.accion === "alerta" && !alertedRef.current) triggerAlert("IA detectó riesgo: " + obj.razon, text);
    } catch { setAiAnalysis({ riesgo:"bajo", razon:"Sin conexión con IA", accion:"normal" }); }
    setIsAnalyzing(false);
  };

  const sendAlerts = async (reason, location) => {
    const active = contacts.filter(c => c.active);
    const message = `🚨 ALERTA DE SEGURIDAD\n👤 ${myName} necesita ayuda\n📍 ${location}\n🚗 Taxi ${DRIVER.plate} | ${DRIVER.name}\n⏰ ${new Date().toLocaleTimeString()}\n📋 ${reason}\n[Agente Seguridad]`;
    for (const c of active) {
      if (snsEndpoint) {
        try {
          const r = await fetch(snsEndpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone: c.phone, message }) });
          setSnsLog(p => [...p, { contact:c.name, ok:r.ok, time:new Date().toLocaleTimeString(), text: r.ok?`SMS enviado a ${c.name}`:`Error con ${c.name}` }]);
        } catch { setSnsLog(p => [...p, { contact:c.name, ok:false, time:new Date().toLocaleTimeString(), text:`Sin conexión — ${c.name}` }]); }
      } else {
        setSnsLog(p => [...p, { contact:c.name, ok:true, sim:true, time:new Date().toLocaleTimeString(), text:`[SIMULADO] SMS a ${c.name} (${c.phone})`, message }]);
      }
    }
  };

  const triggerAlert = (reason, text) => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    setAlertTriggered(true);
    const location = userPos ? `GPS: ${userPos[0].toFixed(5)}, ${userPos[1].toFixed(5)}` : "Cochabamba, Bolivia";
    setAlertDetails({ reason, text, time: new Date().toLocaleTimeString(), location });
    sendAlerts(reason, location);
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Usa Chrome para reconocimiento de voz."); return; }
    const rec = new SR();
    rec.lang = "es-ES"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => {
      const latest = Array.from(e.results).map(r => r[0].transcript).join(" ");
      const entry  = { text: latest, time: new Date().toLocaleTimeString(), id: Date.now() };
      const updated = [...transcriptRef.current.slice(-10), entry];
      transcriptRef.current = updated;
      setTranscript([...updated]);
      const kw = checkKeywords(latest);
      if (kw && !alertedRef.current) { setDetectedKw(kw); triggerAlert(`Keyword: "${kw}"`, latest); }
      if (updated.length % 3 === 0) analyzeWithAI(updated.slice(-3).map(t=>t.text).join(". "));
    };
    rec.onerror = () => {};
    rec.onend   = () => { try { rec.start(); } catch {} };
    recognitionRef.current = rec;
    rec.start();
  };

  const handleStart = async () => {
    alertedRef.current = false;
    setIsActive(true); setAlertTriggered(false); setAlertDetails(null);
    setTranscript([]); transcriptRef.current = []; setSnsLog([]);
    setDetectedKw(null); setAiAnalysis(null); setTripTime(0);
    await startMicLevel(); startListening();
  };

  const handleStop = () => {
    setIsActive(false);
    try { recognitionRef.current?.stop(); } catch {}
    stopMicLevel();
  };

  /* ══════ CONFIG SCREEN ══════ */
  if (screen === "config") {
    const ec = editContacts || contacts;
    return (
      <div style={{ minHeight:"100vh", background:"#0a0a0f", color:"#e0e0e0", fontFamily:"'Courier New',monospace", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"16px 32px", borderBottom:"1px solid #1a1a2e", display:"flex", alignItems:"center", gap:16 }}>
          <button onClick={() => { setScreen("main"); setEditContacts(null); }} style={{ background:"none", border:"1px solid #2a2a3e", borderRadius:8, color:"#7b7bff", fontSize:13, padding:"6px 14px", cursor:"pointer", fontFamily:"'Courier New',monospace" }}>← Volver</button>
          <span style={{ fontSize:12, letterSpacing:3, color:"#888" }}>CONFIGURACIÓN</span>
        </div>
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, padding:32, maxWidth:900, width:"100%" }}>
          <div>
            <SL>TU NOMBRE</SL>
            <CFInput value={myName} onChange={e=>setMyName(e.target.value)} placeholder="Tu nombre" />
            <SL style={{ marginTop:24 }}>ENDPOINT AWS SNS</SL>
            <CFInput value={snsEndpoint} onChange={e=>setSnsEndpoint(e.target.value)} placeholder="https://xxx.execute-api.amazonaws.com/prod/alert" small />
            <div style={{ fontSize:11, color:"#555", marginTop:6, lineHeight:1.7 }}>Sin endpoint los SMS se simulan.</div>
          </div>
          <div>
            <SL>CONTACTOS DE EMERGENCIA</SL>
            {ec.map((c,i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                <input value={c.name} onChange={e=>{ const u=[...ec]; u[i]={...c,name:e.target.value}; setEditContacts(u); }} placeholder="Nombre" style={cfInput()} />
                <input value={c.phone} onChange={e=>{ const u=[...ec]; u[i]={...c,phone:e.target.value}; setEditContacts(u); }} placeholder="+591XXXXXXXXX" style={cfInput()} />
                <button onClick={()=>{ const u=[...ec]; u[i]={...c,active:!c.active}; setEditContacts(u); }}
                  style={{ padding:"8px 12px", background:c.active?"rgba(48,209,88,0.15)":"rgba(255,255,255,0.05)", border:`1px solid ${c.active?"#30d158":"#2a2a3e"}`, borderRadius:8, color:c.active?"#30d158":"#666", fontSize:11, cursor:"pointer", fontFamily:"'Courier New',monospace" }}>
                  {c.active?"ON":"OFF"}
                </button>
                <button onClick={()=>setEditContacts(ec.filter((_,j)=>j!==i))} style={{ padding:"8px 10px", background:"rgba(255,45,85,0.1)", border:"1px solid #ff2d5530", borderRadius:8, color:"#ff2d55", fontSize:11, cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={()=>setEditContacts([...ec,{name:"",phone:"",active:true}])}
              style={{ width:"100%", padding:"10px", background:"rgba(123,123,255,0.08)", border:"1px dashed #3a3a9e", borderRadius:8, color:"#7b7bff", fontSize:12, cursor:"pointer", fontFamily:"'Courier New',monospace", marginBottom:20 }}>
              + Agregar contacto
            </button>
            <button onClick={()=>{ setContacts(ec||contacts); setScreen("main"); setEditContacts(null); }}
              style={{ width:"100%", padding:14, background:"linear-gradient(135deg,#1a1a4e,#2d2d8e)", border:"1px solid #3a3a9e", borderRadius:12, color:"#7b7bff", fontSize:13, cursor:"pointer", fontFamily:"'Courier New',monospace", letterSpacing:2 }}>
              GUARDAR Y VOLVER
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════ MAIN DASHBOARD ══════ */
  const defaultCenter = userPos || [-17.3895, -66.1568];

  return (
    <div style={{ width:"100vw", height:"100vh", background:"#0a0a0f", fontFamily:"'Courier New',monospace", color:"#e0e0e0", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* TOP BAR */}
      <div style={{ background:alertTriggered?"rgba(255,45,85,0.12)":"rgba(255,255,255,0.02)", borderBottom:`2px solid ${alertTriggered?"#ff2d55":"#1a1a2e"}`, padding:"11px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:9, height:9, borderRadius:"50%", background:isActive?(alertTriggered?"#ff2d55":"#30d158"):"#333", boxShadow:isActive?`0 0 12px ${alertTriggered?"#ff2d55":"#30d158"}`:"none", animation:isActive?"pulse 1.5s infinite":"none" }} />
          <span style={{ fontSize:12, letterSpacing:4, color:"#777" }}>AGENTE DE SEGURIDAD</span>
          {isActive && <span style={{ fontSize:11, color:"#30d158", marginLeft:8 }}>⏱ {fmt(tripTime)}</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:20, background:userPos?"rgba(48,209,88,0.08)":"rgba(255,149,0,0.08)", border:`1px solid ${userPos?"#30d15840":"#ff950040"}` }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:userPos?"#30d158":"#ff9500", animation:userPos?"pulse 2s infinite":"none" }} />
            <span style={{ fontSize:9, color:userPos?"#30d158":"#ff9500" }}>
              {userPos ? `GPS ±${accuracy}m` : (gpsError || "Buscando GPS...")}
            </span>
          </div>
          {alertTriggered && <span style={{ fontSize:11, color:"#ff2d55", animation:"blink 1s infinite" }}>🚨 ALERTA ACTIVA</span>}
          <button onClick={()=>{ setEditContacts(null); setScreen("config"); }} style={{ background:"none", border:"1px solid #2a2a3e", borderRadius:8, color:"#666", fontSize:10, padding:"5px 12px", cursor:"pointer", fontFamily:"'Courier New',monospace" }}>⚙ CONFIG</button>
        </div>
      </div>

      {/* ALERT BANNER */}
      {alertTriggered && alertDetails && (
        <div style={{ background:"rgba(255,45,85,0.1)", borderBottom:"1px solid #ff2d5550", padding:"9px 28px", display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
          <div>
            <div style={{ color:"#ff2d55", fontSize:12, fontWeight:"bold" }}>🚨 {alertDetails.reason}</div>
            <div style={{ fontSize:10, color:"#888", marginTop:1 }}>📍 {alertDetails.location} · {alertDetails.time}</div>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {snsLog.map((l,i) => (
              <div key={i} style={{ background:l.ok?"rgba(48,209,88,0.1)":"rgba(255,45,85,0.1)", border:`1px solid ${l.ok?"#30d158":"#ff2d55"}`, borderRadius:20, padding:"3px 10px", fontSize:10, color:l.ok?"#30d158":"#ff2d55" }}>
                {l.ok?`✓ ${l.contact}`:`✗ ${l.contact}`}{l.sim?" (sim)":""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GRID 4 columnas */}
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"250px 1fr 360px 240px", gap:0, overflow:"hidden", minHeight:0 }}>

        {/* COL 1: Driver + Contacts */}
        <div style={{ borderRight:"1px solid #1a1a2e", display:"flex", flexDirection:"column", overflowY:"auto" }}>
          <div style={{ padding:16, borderBottom:"1px solid #1a1a2e" }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, marginBottom:12 }}>CONDUCTOR</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <div style={{ width:46, height:46, borderRadius:"50%", background:"linear-gradient(135deg,#1a1a4e,#2d2d8e)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:"bold", color:"#7b7bff", border:"2px solid #3a3a9e", flexShrink:0 }}>CM</div>
              <div>
                <div style={{ fontSize:13, fontWeight:"bold" }}>{DRIVER.name}</div>
                <div style={{ fontSize:10, color:"#888" }}>Placa: {DRIVER.plate}</div>
                <div style={{ fontSize:10, color:"#888" }}>{DRIVER.trips} viajes</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:1, background:"rgba(255,214,10,0.08)", border:"1px solid #ffd60a30", borderRadius:8, padding:"8px", textAlign:"center" }}>
                <div style={{ fontSize:15, color:"#ffd60a" }}>★ {DRIVER.rating}</div>
                <div style={{ fontSize:9, color:"#666", marginTop:1 }}>Rating</div>
              </div>
              <div style={{ flex:1, background:"rgba(48,209,88,0.08)", border:"1px solid #30d15830", borderRadius:8, padding:"8px", textAlign:"center" }}>
                <div style={{ fontSize:13, color:"#30d158" }}>✓</div>
                <div style={{ fontSize:9, color:"#666", marginTop:1 }}>Verificado</div>
              </div>
            </div>
          </div>
          <div style={{ padding:16, flex:1 }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, marginBottom:12 }}>CONTACTOS</div>
            {contacts.map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:"rgba(255,255,255,0.03)", borderRadius:8, marginBottom:6, border:"1px solid #1e1e2e", opacity:c.active?1:0.4 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(123,123,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, border:"1px solid #3a3a9e", flexShrink:0 }}>👤</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, color:"#e0e0e0" }}>{c.name}</div>
                  <div style={{ fontSize:9, color:"#666" }}>{c.phone}</div>
                </div>
                <div style={{ fontSize:8, padding:"2px 6px", borderRadius:10, background:c.active?"rgba(48,209,88,0.1)":"rgba(255,255,255,0.05)", color:c.active?"#30d158":"#555", border:`1px solid ${c.active?"#30d15840":"#2a2a3e"}` }}>
                  {c.active?"ON":"OFF"}
                </div>
              </div>
            ))}
            <button onClick={()=>setScreen("config")} style={{ width:"100%", padding:"7px", background:"rgba(123,123,255,0.06)", border:"1px dashed #2a2a4e", borderRadius:8, color:"#7b7bff", fontSize:10, cursor:"pointer", fontFamily:"'Courier New',monospace", marginTop:4 }}>
              ✎ Editar contactos
            </button>
          </div>
        </div>

        {/* COL 2: Transcript + AI + Controls */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"11px 18px", borderBottom:"1px solid #1a1a2e", display:"flex", alignItems:"center", gap:14, background:"rgba(123,123,255,0.03)", flexShrink:0 }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, flexShrink:0 }}>ANÁLISIS IA</div>
            {isAnalyzing
              ? <div style={{ fontSize:11, color:"#7b7bff" }}>⟳ Analizando...</div>
              : aiAnalysis
                ? <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ padding:"3px 12px", borderRadius:20, fontSize:10, background:`${RC[aiAnalysis.riesgo]}15`, color:RC[aiAnalysis.riesgo], border:`1px solid ${RC[aiAnalysis.riesgo]}40` }}>
                      Riesgo {aiAnalysis.riesgo?.toUpperCase()}
                    </div>
                    <span style={{ fontSize:11, color:"#aaa" }}>{aiAnalysis.razon}</span>
                  </div>
                : <div style={{ fontSize:11, color:"#444" }}>{isActive?"Esperando audio...":"Inicia el monitoreo para activar la IA"}</div>
            }
          </div>
          <div style={{ flex:1, padding:"14px 18px", overflowY:"auto" }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, marginBottom:12 }}>TRANSCRIPCIÓN EN VIVO</div>
            {transcript.length === 0
              ? <div style={{ textAlign:"center", padding:"50px 20px" }}>
                  <div style={{ fontSize:34, marginBottom:10 }}>🎙</div>
                  <div style={{ fontSize:12, color:"#333" }}>{isActive?"Habla cerca del micrófono...":"Presiona INICIAR para activar"}</div>
                </div>
              : transcript.map((t,i) => (
                  <div key={t.id} style={{ padding:"8px 11px", marginBottom:6, background:"rgba(255,255,255,0.02)", borderRadius:8, borderLeft:`3px solid ${i===transcript.length-1?"#7b7bff":"#1e1e2e"}`, opacity:0.4+(i/transcript.length)*0.6 }}>
                    <div style={{ fontSize:9, color:"#555", marginBottom:3 }}>{t.time}</div>
                    <div style={{ fontSize:12, color:"#ccc", lineHeight:1.5 }}>{t.text}</div>
                  </div>
                ))
            }
          </div>
          <div style={{ padding:"12px 18px", borderTop:"1px solid #1a1a2e", display:"flex", gap:10, flexShrink:0 }}>
            {!isActive
              ? <button onClick={handleStart} style={{ flex:1, padding:"13px", background:"linear-gradient(135deg,#1a1a4e,#2d2d8e)", border:"1px solid #3a3a9e", borderRadius:12, color:"#7b7bff", fontSize:12, letterSpacing:3, cursor:"pointer", fontFamily:"'Courier New',monospace", fontWeight:"bold" }}>
                  🎙 INICIAR MONITOREO
                </button>
              : <>
                  <button onClick={handleStop} style={{ flex:1, padding:"11px", background:"rgba(255,45,85,0.08)", border:"1px solid #ff2d5540", borderRadius:12, color:"#ff2d55", fontSize:11, cursor:"pointer", fontFamily:"'Courier New',monospace" }}>■ TERMINAR</button>
                  {!alertTriggered && (
                    <button onClick={()=>triggerAlert("SOS Manual activado","")} style={{ padding:"11px 22px", background:"rgba(255,45,85,0.2)", border:"2px solid #ff2d55", borderRadius:12, color:"#ff2d55", fontSize:13, cursor:"pointer", fontFamily:"'Courier New',monospace", fontWeight:"bold" }}>🚨 SOS</button>
                  )}
                </>
            }
          </div>
        </div>

        {/* COL 3: MAPA */}
        <div style={{ borderLeft:"1px solid #1a1a2e", borderRight:"1px solid #1a1a2e", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"11px 16px", borderBottom:"1px solid #1a1a2e", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3 }}>UBICACIÓN EN TIEMPO REAL</div>
            {userPos && <div style={{ fontSize:9, color:"#444" }}>{userPos[0].toFixed(4)}, {userPos[1].toFixed(4)}</div>}
          </div>
          <div style={{ flex:1, position:"relative", minHeight:0 }}>
            {userPos ? (
              <MapContainer center={defaultCenter} zoom={16} style={{ width:"100%", height:"100%" }} zoomControl={true}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                <MapUpdater center={userPos} />
                {accuracy && (
                  <Circle center={userPos} radius={accuracy}
                    pathOptions={{ color:alertTriggered?"#ff2d55":"#7b7bff", fillColor:alertTriggered?"#ff2d55":"#7b7bff", fillOpacity:0.08, weight:1.5 }} />
                )}
                <Marker position={userPos} icon={alertTriggered ? alertIcon : pulsingIcon}>
                  <Popup>
                    <div style={{ fontFamily:"sans-serif", fontSize:12 }}>
                      <strong>{myName}</strong><br/>
                      🚗 {DRIVER.plate}<br/>
                      📍 ±{accuracy}m
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"#333" }}>
                <div style={{ fontSize:30, marginBottom:10 }}>🗺️</div>
                <div style={{ fontSize:11, color:"#444", textAlign:"center", padding:"0 20px" }}>{gpsError || "Obteniendo ubicación GPS..."}</div>
                {gpsError && <div style={{ fontSize:9, color:"#555", marginTop:6, textAlign:"center", padding:"0 20px" }}>Permite el acceso a ubicación en tu navegador</div>}
              </div>
            )}
          </div>
          <div style={{ padding:"8px 16px", borderTop:"1px solid #1a1a2e", display:"flex", justifyContent:"space-between", flexShrink:0 }}>
            <div style={{ fontSize:9, color:"#555" }}>{locationHistory.length > 0 ? `${locationHistory.length} pts registrados` : "Sin historial"}</div>
            <div style={{ fontSize:9, color:userPos?"#30d158":"#ff9500" }}>{userPos?`● Activo ±${accuracy}m`:"○ Sin señal"}</div>
          </div>
        </div>

        {/* COL 4: Mic + Keywords + SMS Log */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:14, borderBottom:"1px solid #1a1a2e", flexShrink:0 }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, marginBottom:10 }}>NIVEL DE AUDIO</div>
            <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:40, marginBottom:6 }}>
              {Array.from({length:24}).map((_,i) => (
                <div key={i} style={{ flex:1, background:(micLevel/100)*24>i?(micLevel>70?"#ff2d55":micLevel>40?"#ff9500":"#30d158"):"#1a1a2e", borderRadius:2, height:`${15+Math.sin(i*0.7)*12}%`, transition:"background 0.1s", minHeight:3 }} />
              ))}
            </div>
            <div style={{ fontSize:9, color:isActive?"#30d158":"#555", textAlign:"center" }}>
              {isActive?(micLevel<5?"Silencio...":"● Escuchando"):"Inactivo"}
            </div>
            {detectedKw && (
              <div style={{ marginTop:7, padding:"5px 8px", background:"rgba(255,45,85,0.08)", border:"1px solid #ff2d5530", borderRadius:8, fontSize:10, color:"#ff2d55", textAlign:"center" }}>
                ⚡ "{detectedKw}"
              </div>
            )}
          </div>
          <div style={{ padding:"12px 14px", borderBottom:"1px solid #1a1a2e", flexShrink:0 }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, marginBottom:8 }}>KEYWORDS</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {DEFAULT_KEYWORDS.map(kw => (
                <div key={kw} style={{ padding:"3px 7px", borderRadius:10, background:detectedKw===kw?"rgba(255,45,85,0.15)":"rgba(255,255,255,0.04)", border:`1px solid ${detectedKw===kw?"#ff2d55":"#1e1e2e"}`, color:detectedKw===kw?"#ff2d55":"#555", fontSize:9 }}>{kw}</div>
              ))}
            </div>
          </div>
          <div style={{ flex:1, padding:"12px 14px", overflowY:"auto" }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:3, marginBottom:8 }}>SMS LOG</div>
            {snsLog.length===0
              ? <div style={{ fontSize:10, color:"#222", textAlign:"center", paddingTop:14 }}>Sin actividad</div>
              : snsLog.map((l,i) => (
                  <div key={i} style={{ padding:"7px 9px", background:l.ok?"rgba(48,209,88,0.05)":"rgba(255,45,85,0.05)", border:`1px solid ${l.ok?"#30d15830":"#ff2d5530"}`, borderRadius:8, marginBottom:6 }}>
                    <div style={{ fontSize:10, color:l.ok?"#30d158":"#ff2d55" }}>{l.text}</div>
                    {l.sim && <div style={{ fontSize:8, color:"#444", marginTop:2 }}>simulado</div>}
                    <div style={{ fontSize:8, color:"#333", marginTop:1 }}>{l.time}</div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
        @keyframes flashIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes mapPulse{0%,100%{box-shadow:0 0 0 4px rgba(123,123,255,0.3)}50%{box-shadow:0 0 0 12px rgba(123,123,255,0.05)}}
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{width:100%;height:100%;overflow:hidden}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:2px}
        input::placeholder{color:#333}
        input:focus{outline:none;border-color:#3a3a9e !important}
        .leaflet-container{background:#0d0d1a !important}
        .leaflet-tile{filter:brightness(0.8) saturate(0.6) hue-rotate(200deg)}
        .leaflet-control-zoom a{background:#1a1a2e !important;color:#7b7bff !important;border-color:#2a2a3e !important}
        .leaflet-popup-content-wrapper{background:#1a1a2e;border:1px solid #2a2a3e;color:#e0e0e0;font-family:'Courier New',monospace}
        .leaflet-popup-tip{background:#1a1a2e}
        .leaflet-attribution-flag{display:none}
      `}</style>
    </div>
  );
}

const SL = ({children,style}) => <div style={{ fontSize:10,color:"#555",letterSpacing:3,marginBottom:10,textTransform:"uppercase",...style }}>{children}</div>;
const CFInput = ({value,onChange,placeholder,small}) => (
  <input value={value} onChange={onChange} placeholder={placeholder}
    style={{ width:"100%",padding:"10px 12px",background:"rgba(255,255,255,0.05)",border:"1px solid #2a2a3e",borderRadius:8,color:"#e0e0e0",fontSize:small?11:13,fontFamily:"'Courier New',monospace",marginBottom:4 }} />
);
const cfInput = () => ({ flex:1,padding:"8px 10px",background:"rgba(255,255,255,0.05)",border:"1px solid #2a2a3e",borderRadius:8,color:"#e0e0e0",fontSize:11,fontFamily:"'Courier New',monospace" });