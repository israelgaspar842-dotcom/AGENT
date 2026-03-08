import { useState, useEffect, useRef, useCallback } from "react";

const DEFAULT_KEYWORDS = ["auxilio","ayuda","socorro","peligro","suéltame","sueltame","no me toques","help","para","déjame","dejame","llamen","policia","policía"];

const DEFAULT_CONTACTS = [
  { name: "Mamá",    phone: "+591 7XX-XXXX", active: true  },
  { name: "Papá",    phone: "+591 6XX-XXXX", active: true  },
  { name: "Amigo/a", phone: "+591 7XX-XXXX", active: false },
];

const RC = { alto:"#ff2d55", medio:"#ff9500", bajo:"#30d158" };

export default function AgenteSeguridad({ conductorNFC, placaNFC }) {
  // LECTURA DIRECTA DE LA URL (Evitamos depender de App.jsx)
  const params = new URLSearchParams(window.location.search);
  const nombreUrl = params.get("conductorNFC") || params.get("conductor");
  const placaUrl = params.get("placaNFC") || params.get("placa");

  const nombreFinal = nombreUrl || conductorNFC || "Conductor no identificado";
  const placaFinal = placaUrl || placaNFC || "Placa desconocida";

  const DRIVER = { 
    name: nombreFinal, 
    plate: placaFinal, 
    rating: 4.2, 
    trips: 1247, 
    verified: nombreFinal !== "Conductor no identificado" 
  };

  // EXTRACTOR DINÁMICO DE INICIALES (Reemplaza al "CM")
  const getInitials = (name) => {
    if (name === "Conductor no identificado") return "?";
    const words = name.trim().split(" ");
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };
  const driverInitials = getInitials(DRIVER.name);

  const [screen, setScreen]               = useState("main");
  const [isActive, setIsActive]           = useState(false);
  const [transcript, setTranscript]       = useState([]);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [alertDetails, setAlertDetails]   = useState(null);
  const [aiAnalysis, setAiAnalysis]       = useState(null);
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [tripTime, setTripTime]           = useState(0);
  const [detectedKw, setDetectedKw]       = useState(null);
  const [micLevel, setMicLevel]           = useState(0);
  const [snsLog, setSnsLog]               = useState([]);
  const [contacts, setContacts]           = useState(DEFAULT_CONTACTS);
  const [myName, setMyName]               = useState("Pasajero");
  const [snsEndpoint, setSnsEndpoint]     = useState("");
  const [editContacts, setEditContacts]   = useState(null);

  const recognitionRef = useRef(null);
  const timerRef       = useRef(null);
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const micStreamRef   = useRef(null);
  const animFrameRef   = useRef(null);
  const transcriptRef  = useRef([]);
  const alertedRef     = useRef(false);
  const isListeningRef = useRef(false);

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
        if (!analyserRef.current) return;
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
      if (obj.accion === "alerta" && !alertedRef.current)
        triggerAlert("IA detectó riesgo: " + obj.razon, text);
    } catch { setAiAnalysis({ riesgo:"bajo", razon:"Sin conexión con IA", accion:"normal" }); }
    setIsAnalyzing(false);
  };

  const sendAlerts = async (reason, location) => {
    const active  = contacts.filter(c => c.active);
    const message =
`🚨 ALERTA DE SEGURIDAD
👤 ${myName} necesita ayuda
📍 ${location}
🚗 Taxi ${DRIVER.plate} | ${DRIVER.name}
⏰ ${new Date().toLocaleTimeString()}
📋 ${reason}
[Agente Seguridad]`;

    for (const c of active) {
      if (snsEndpoint) {
        try {
          const r = await fetch(snsEndpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone: c.phone, message }) });
          setSnsLog(p => [...p, { contact:c.name, ok:r.ok, time:new Date().toLocaleTimeString(), text: r.ok?`SMS enviado a ${c.name}`:`Error con ${c.name}` }]);
        } catch {
          setSnsLog(p => [...p, { contact:c.name, ok:false, time:new Date().toLocaleTimeString(), text:`Sin conexión — ${c.name}` }]);
        }
      } else {
        setSnsLog(p => [...p, { contact:c.name, ok:true, sim:true, time:new Date().toLocaleTimeString(), text:`[SIMULADO] SMS a ${c.name} (${c.phone})`, message }]);
      }
    }
  };

  const triggerAlert = (reason, text) => {
    if (alertedRef.current) return;
    alertedRef.current = true;
    setAlertTriggered(true);
    const location = "Sucre, Bolivia (GPS activo)";
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
      
      const comandoParada = "viaje terminado";
      if (latest.toLowerCase().includes(comandoParada)) {
        console.log("Comando de voz detectado. Apagando sensores...");
        handleStop(); 
        return; 
      }

      const entry  = { text: latest, time: new Date().toLocaleTimeString(), id: Date.now() };
      const updated = [...transcriptRef.current.slice(-10), entry];
      transcriptRef.current = updated;
      setTranscript([...updated]);
      
      const kw = checkKeywords(latest);
      if (kw && !alertedRef.current) { setDetectedKw(kw); triggerAlert(`Keyword: "${kw}"`, latest); }
      if (updated.length % 3 === 0) analyzeWithAI(updated.slice(-3).map(t=>t.text).join(". "));
    };
    
    rec.onerror = () => {};
    
    rec.onend = () => { 
      if (isListeningRef.current) { 
        try { rec.start(); } catch {} 
      } 
    };
    
    recognitionRef.current = rec;
    rec.start();
  };

 const handleStart = async () => {
    alertedRef.current = false;
    isListeningRef.current = true;
    setIsActive(true); setAlertTriggered(false); setAlertDetails(null);
    setTranscript([]); transcriptRef.current = []; setSnsLog([]);
    setDetectedKw(null); setAiAnalysis(null); setTripTime(0);
    
    await startMicLevel(); 
    startListening();

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("GPS activado. Lat:", position.coords.latitude, "Lon:", position.coords.longitude);
        },
        (error) => {
          console.error("Error de GPS:", error.message);
        }
      );
    } else {
      console.warn("Este navegador no soporta GPS.");
    }
  };

  const handleStop = () => {
    isListeningRef.current = false;
    setIsActive(false);
    try { recognitionRef.current?.stop(); } catch {}
    stopMicLevel();
  };

  /* ══════════ CONFIG SCREEN ══════════ */
  if (screen === "config") {
    const ec = editContacts || contacts;
    return (
      <div style={{ minHeight:"100vh", background:"#0a0a0f", color:"#e0e0e0", fontFamily:"'Courier New',monospace", display:"flex", flexDirection:"column" }}>
        {/* header */}
        <div style={{ padding:"16px 32px", borderBottom:"1px solid #1a1a2e", display:"flex", alignItems:"center", gap:16 }}>
          <button onClick={() => { setScreen("main"); setEditContacts(null); }} style={{ background:"none", border:"1px solid #2a2a3e", borderRadius:8, color:"#7b7bff", fontSize:13, padding:"6px 14px", cursor:"pointer", fontFamily:"'Courier New',monospace" }}>← Volver</button>
          <span style={{ fontSize:12, letterSpacing:3, color:"#888" }}>CONFIGURACIÓN</span>
        </div>

        <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, padding:32, maxWidth:900, width:"100%" }}>
          {/* left col */}
          <div>
            <SL>TU NOMBRE</SL>
            <CFInput value={myName} onChange={e=>setMyName(e.target.value)} placeholder="Tu nombre" />

            <SL style={{ marginTop:24 }}>ENDPOINT AWS SNS</SL>
            <CFInput value={snsEndpoint} onChange={e=>setSnsEndpoint(e.target.value)} placeholder="https://xxx.execute-api.amazonaws.com/prod/alert" small />
            <div style={{ fontSize:11, color:"#555", marginTop:6, lineHeight:1.7 }}>
              Sin endpoint los SMS se simulan — el mensaje se muestra en el log pero no se envía realmente.
            </div>
          </div>

          {/* right col — contacts */}
          <div>
            <SL>CONTACTOS DE EMERGENCIA</SL>
            {ec.map((c,i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                <input value={c.name} onChange={e=>{ const u=[...ec]; u[i]={...c,name:e.target.value}; setEditContacts(u); }}
                  placeholder="Nombre" style={cfInput()} />
                <input value={c.phone} onChange={e=>{ const u=[...ec]; u[i]={...c,phone:e.target.value}; setEditContacts(u); }}
                  placeholder="+591XXXXXXXXX" style={cfInput()} />
                <button onClick={()=>{ const u=[...ec]; u[i]={...c,active:!c.active}; setEditContacts(u); }}
                  style={{ padding:"8px 12px", background:c.active?"rgba(48,209,88,0.15)":"rgba(255,255,255,0.05)", border:`1px solid ${c.active?"#30d158":"#2a2a3e"}`, borderRadius:8, color:c.active?"#30d158":"#666", fontSize:11, cursor:"pointer", fontFamily:"'Courier New',monospace" }}>
                  {c.active?"ON":"OFF"}
                </button>
                <button onClick={()=>setEditContacts(ec.filter((_,j)=>j!==i))}
                  style={{ padding:"8px 10px", background:"rgba(255,45,85,0.1)", border:"1px solid #ff2d5530", borderRadius:8, color:"#ff2d55", fontSize:11, cursor:"pointer" }}>✕</button>
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

  /* ══════════ MAIN DASHBOARD ══════════ */
  return (
    <div style={{ width:"100vw", minHeight:"100vh", background:"#0a0a0f", fontFamily:"'Courier New',monospace", color:"#e0e0e0", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* ── TOP BAR ── */}
      <div style={{ background:alertTriggered?"rgba(255,45,85,0.12)":"rgba(255,255,255,0.02)", borderBottom:`2px solid ${alertTriggered?"#ff2d55":"#1a1a2e"}`, padding:"14px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"all 0.5s", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:isActive?(alertTriggered?"#ff2d55":"#30d158"):"#333", boxShadow:isActive?`0 0 14px ${alertTriggered?"#ff2d55":"#30d158"}`:"none", animation:isActive?"pulse 1.5s infinite":"none" }} />
          <span style={{ fontSize:13, letterSpacing:4, color:"#777" }}>AGENTE DE SEGURIDAD</span>
          {isActive && <span style={{ fontSize:12, color:"#30d158", marginLeft:8 }}>⏱ {fmt(tripTime)}</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {alertTriggered && <span style={{ fontSize:12, color:"#ff2d55", animation:"blink 1s infinite" }}>🚨 ALERTA ACTIVA</span>}
          <button onClick={()=>{ setEditContacts(null); setScreen("config"); }} style={{ background:"none", border:"1px solid #2a2a3e", borderRadius:8, color:"#666", fontSize:11, padding:"6px 14px", cursor:"pointer", fontFamily:"'Courier New',monospace", letterSpacing:1 }}>⚙ CONFIGURACIÓN</button>
        </div>
      </div>

      {/* ── ALERT BANNER ── */}
      {alertTriggered && alertDetails && (
        <div style={{ background:"rgba(255,45,85,0.1)", borderBottom:"1px solid #ff2d5550", padding:"12px 32px", display:"flex", alignItems:"center", gap:24, animation:"flashIn .3s ease" }}>
          <div>
            <div style={{ color:"#ff2d55", fontSize:14, fontWeight:"bold" }}>🚨 {alertDetails.reason}</div>
            <div style={{ fontSize:11, color:"#888", marginTop:2 }}>📍 {alertDetails.location} · {alertDetails.time}</div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {snsLog.map((l,i) => (
              <div key={i} style={{ background:l.ok?"rgba(48,209,88,0.1)":"rgba(255,45,85,0.1)", border:`1px solid ${l.ok?"#30d158":"#ff2d55"}`, borderRadius:20, padding:"4px 12px", fontSize:11, color:l.ok?"#30d158":"#ff2d55" }}>
                {l.ok?`✓ ${l.contact}`:`✗ ${l.contact}`}{l.sim?" (sim)":""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN GRID ── */}
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"300px 1fr 280px", gridTemplateRows:"auto 1fr", gap:0, overflow:"hidden" }}>

        {/* ── COL 1: Driver + Contacts ── */}
        <div style={{ borderRight:"1px solid #1a1a2e", display:"flex", flexDirection:"column", overflowY:"auto" }}>
          {/* Driver card */}
          <div style={{ padding:20, borderBottom:"1px solid #1a1a2e" }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, marginBottom:14 }}>CONDUCTOR</div>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,#1a1a4e,#2d2d8e)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:"bold", color:"#7b7bff", border:"2px solid #3a3a9e", flexShrink:0 }}>
                {driverInitials}
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:"bold", color:"#e0e0e0" }}>{DRIVER.name}</div>
                <div style={{ fontSize:11, color:"#888", marginTop:2 }}>Placa: {DRIVER.plate}</div>
                <div style={{ fontSize:11, color:"#888" }}>{DRIVER.trips} viajes completados</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1, background:"rgba(255,214,10,0.08)", border:"1px solid #ffd60a30", borderRadius:8, padding:"10px", textAlign:"center" }}>
                <div style={{ fontSize:18, color:"#ffd60a" }}>★ {DRIVER.rating}</div>
                <div style={{ fontSize:10, color:"#666", marginTop:2 }}>Calificación</div>
              </div>
              {DRIVER.verified && (
                <div style={{ flex:1, background:"rgba(48,209,88,0.08)", border:"1px solid #30d15830", borderRadius:8, padding:"10px", textAlign:"center" }}>
                  <div style={{ fontSize:16, color:"#30d158" }}>✓</div>
                  <div style={{ fontSize:10, color:"#666", marginTop:2 }}>Verificado</div>
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          <div style={{ padding:20, flex:1 }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, marginBottom:14 }}>CONTACTOS DE EMERGENCIA</div>
            {contacts.map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"rgba(255,255,255,0.03)", borderRadius:8, marginBottom:8, border:"1px solid #1e1e2e", opacity:c.active?1:0.4 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(123,123,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, border:"1px solid #3a3a9e", flexShrink:0 }}>👤</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:"#e0e0e0" }}>{c.name}</div>
                  <div style={{ fontSize:10, color:"#666" }}>{c.phone}</div>
                </div>
                <div style={{ fontSize:9, padding:"2px 7px", borderRadius:10, background:c.active?"rgba(48,209,88,0.1)":"rgba(255,255,255,0.05)", color:c.active?"#30d158":"#555", border:`1px solid ${c.active?"#30d15840":"#2a2a3e"}` }}>
                  {c.active?"ON":"OFF"}
                </div>
              </div>
            ))}
            <button onClick={()=>setScreen("config")} style={{ width:"100%", padding:"8px", background:"rgba(123,123,255,0.06)", border:"1px dashed #2a2a4e", borderRadius:8, color:"#7b7bff", fontSize:11, cursor:"pointer", fontFamily:"'Courier New',monospace", marginTop:4 }}>
              ✎ Editar contactos
            </button>
          </div>
        </div>

        {/* ── COL 2: Transcript + AI ── */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* AI Analysis bar */}
          <div style={{ padding:"16px 24px", borderBottom:"1px solid #1a1a2e", display:"flex", alignItems:"center", gap:20, background:"rgba(123,123,255,0.03)" }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, flexShrink:0 }}>ANÁLISIS IA</div>
            {isAnalyzing
              ? <div style={{ fontSize:12, color:"#7b7bff" }}>⟳ Analizando...</div>
              : aiAnalysis
                ? <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ padding:"4px 14px", borderRadius:20, fontSize:11, background:`${RC[aiAnalysis.riesgo]}15`, color:RC[aiAnalysis.riesgo], border:`1px solid ${RC[aiAnalysis.riesgo]}40` }}>
                      Riesgo {aiAnalysis.riesgo?.toUpperCase()}
                    </div>
                    <span style={{ fontSize:12, color:"#aaa" }}>{aiAnalysis.razon}</span>
                  </div>
                : <div style={{ fontSize:12, color:"#444" }}>{isActive?"Esperando audio para analizar...":"Inicia el monitoreo para activar el agente IA"}</div>
            }
          </div>

          {/* Transcript */}
          <div style={{ flex:1, padding:"20px 24px", overflowY:"auto" }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, marginBottom:16 }}>TRANSCRIPCIÓN EN VIVO</div>
            {transcript.length === 0
              ? <div style={{ textAlign:"center", padding:"60px 20px", color:"#2a2a3e" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🎙</div>
                  <div style={{ fontSize:13, color:"#444" }}>{isActive?"Habla cerca del micrófono...":"Presiona INICIAR MONITOREO para activar"}</div>
                </div>
              : transcript.map((t,i) => (
                  <div key={t.id} style={{ padding:"10px 14px", marginBottom:8, background:"rgba(255,255,255,0.02)", borderRadius:8, borderLeft:`3px solid ${i===transcript.length-1?"#7b7bff":"#1e1e2e"}`, opacity:0.4+(i/transcript.length)*0.6, transition:"opacity 0.3s" }}>
                    <div style={{ fontSize:10, color:"#555", marginBottom:4 }}>{t.time}</div>
                    <div style={{ fontSize:13, color:"#ccc", lineHeight:1.5 }}>{t.text}</div>
                  </div>
                ))
            }
          </div>

          {/* Bottom controls */}
          <div style={{ padding:"16px 24px", borderTop:"1px solid #1a1a2e", display:"flex", gap:12 }}>
            {!isActive
              ? <button onClick={handleStart} style={{ flex:1, padding:"14px", background:"linear-gradient(135deg,#1a1a4e,#2d2d8e)", border:"1px solid #3a3a9e", borderRadius:12, color:"#7b7bff", fontSize:13, letterSpacing:3, cursor:"pointer", fontFamily:"'Courier New',monospace", fontWeight:"bold" }}>
                  🎙 INICIAR MONITOREO DE VIAJE
                </button>
              : <>
                  <button onClick={handleStop} style={{ flex:1, padding:"13px", background:"rgba(255,45,85,0.08)", border:"1px solid #ff2d5540", borderRadius:12, color:"#ff2d55", fontSize:12, cursor:"pointer", fontFamily:"'Courier New',monospace" }}>■ TERMINAR VIAJE</button>
                  {!alertTriggered && (
                    <button onClick={()=>triggerAlert("SOS Manual activado","")} style={{ padding:"13px 28px", background:"rgba(255,45,85,0.2)", border:"2px solid #ff2d55", borderRadius:12, color:"#ff2d55", fontSize:14, cursor:"pointer", fontFamily:"'Courier New',monospace", fontWeight:"bold" }}>🚨 SOS</button>
                  )}
                </>
            }
          </div>
        </div>

        {/* ── COL 3: Mic + SMS Log ── */}
        <div style={{ borderLeft:"1px solid #1a1a2e", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Mic visualizer */}
          <div style={{ padding:20, borderBottom:"1px solid #1a1a2e" }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, marginBottom:14 }}>NIVEL DE AUDIO</div>
            <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:50, marginBottom:10 }}>
              {Array.from({length:20}).map((_,i) => (
                <div key={i} style={{ flex:1, background: (micLevel/100)*20 > i ? (micLevel>70?"#ff2d55":micLevel>40?"#ff9500":"#30d158") : "#1a1a2e", borderRadius:2, height:`${20+Math.sin(i*0.8)*15}%`, transition:"background 0.1s", minHeight:4 }} />
              ))}
            </div>
            <div style={{ fontSize:10, color:isActive?"#30d158":"#555", textAlign:"center" }}>
              {isActive?(micLevel<5?"Silencio...":"● Escuchando"):"Inactivo"}
            </div>
            {detectedKw && (
              <div style={{ marginTop:10, padding:"8px 10px", background:"rgba(255,45,85,0.08)", border:"1px solid #ff2d5530", borderRadius:8, fontSize:11, color:"#ff2d55", textAlign:"center" }}>
                ⚡ "{detectedKw}" detectada
              </div>
            )}
          </div>

          {/* Keywords */}
          <div style={{ padding:"16px 20px", borderBottom:"1px solid #1a1a2e" }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, marginBottom:12 }}>KEYWORDS ACTIVAS</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {DEFAULT_KEYWORDS.map(kw => (
                <div key={kw} style={{ padding:"4px 10px", borderRadius:12, background:detectedKw===kw?"rgba(255,45,85,0.15)":"rgba(255,255,255,0.04)", border:`1px solid ${detectedKw===kw?"#ff2d55":"#1e1e2e"}`, color:detectedKw===kw?"#ff2d55":"#666", fontSize:10 }}>{kw}</div>
              ))}
            </div>
          </div>

          {/* SMS Log */}
          <div style={{ flex:1, padding:"16px 20px", overflowY:"auto" }}>
            <div style={{ fontSize:10, color:"#555", letterSpacing:3, marginBottom:12 }}>SMS LOG</div>
            {snsLog.length===0
              ? <div style={{ fontSize:11, color:"#2a2a3e", textAlign:"center", paddingTop:20 }}>Sin actividad aún</div>
              : snsLog.map((l,i) => (
                  <div key={i} style={{ padding:"9px 11px", background:l.ok?"rgba(48,209,88,0.05)":"rgba(255,45,85,0.05)", border:`1px solid ${l.ok?"#30d15830":"#ff2d5530"}`, borderRadius:8, marginBottom:8 }}>
                    <div style={{ fontSize:11, color:l.ok?"#30d158":"#ff2d55" }}>{l.text}</div>
                    {l.sim && <div style={{ fontSize:9, color:"#555", marginTop:3 }}>modo simulado</div>}
                    <div style={{ fontSize:9, color:"#444", marginTop:2 }}>{l.time}</div>
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
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{width:100%;height:100%;overflow:hidden}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:2px}
        input::placeholder{color:#333}
        input:focus{outline:none;border-color:#3a3a9e !important}
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