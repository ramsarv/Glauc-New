// GlaucApp.jsx — Complete Glauc Mobile App
// React Native Web / Expo — runs in browser and as native app
// Design: luxury wellness × precision medical instrument
// Palette: deep obsidian base, warm amber/gold iris accent, cream text
// Typography: Playfair Display (display) + DM Sans (body)

import { useState, useEffect, useRef, useCallback } from "react";

// ─── DESIGN TOKENS ───────────────────────────────────────────
const T = {
  obsidian:   "#0A0A0F",
  obsidian2:  "#111118",
  obsidian3:  "#181820",
  surface:    "#1E1E28",
  surfaceHi:  "#252532",
  border:     "#2A2A38",
  amber:      "#C8922A",
  amberHi:    "#E5A832",
  amberGlow:  "rgba(200,146,42,0.12)",
  amberSoft:  "rgba(200,146,42,0.06)",
  cream:      "#F2EDE4",
  creamMid:   "#B8B0A0",
  creamLow:   "#5A5650",
  teal:       "#2AADA0",
  tealSoft:   "rgba(42,173,160,0.12)",
  red:        "#C84040",
  redSoft:    "rgba(200,64,64,0.12)",
  gold:       "#D4A843",
  r: "8px", rm: "12px", rl: "20px", rxl: "32px",
};

// ─── GLOBAL STYLES ───────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body, #root {
      width: 100%; height: 100%;
      background: ${T.obsidian};
      color: ${T.cream};
      font-family: 'DM Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
      overscroll-behavior: none;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 2px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }

    /* Animations */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
    }
    @keyframes scanLine {
      0%   { top: 12%; opacity: 0; }
      5%   { opacity: 1; }
      95%  { opacity: 1; }
      100% { top: 88%; opacity: 0; }
    }
    @keyframes ringPulse {
      0%   { transform: scale(1);   opacity: 0.6; }
      50%  { transform: scale(1.08);opacity: 0.2; }
      100% { transform: scale(1);   opacity: 0.6; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); } to { transform: rotate(360deg); }
    }
    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes irisReveal {
      from { clip-path: circle(0% at 50% 50%); opacity: 0; }
      to   { clip-path: circle(60% at 50% 50%); opacity: 1; }
    }
    @keyframes countUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes gradientFlow {
      0%   { background-position: 0%   50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0%   50%; }
    }

    .fade-up  { animation: fadeUp  0.5s ease forwards; }
    .fade-in  { animation: fadeIn  0.4s ease forwards; }
    .shimmer  {
      background: linear-gradient(90deg,
        ${T.surface} 0%, ${T.surfaceHi} 40%, ${T.surface} 80%);
      background-size: 200% 100%;
      animation: shimmer 1.6s ease-in-out infinite;
    }

    button { cursor: pointer; border: none; background: none; font-family: inherit; }
    input  { font-family: inherit; }
  `}</style>
);

// ─── SHARED COMPONENTS ───────────────────────────────────────

// Top navigation bar
const NavBar = ({ title, onBack, rightAction }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 24px", paddingTop: "calc(16px + env(safe-area-inset-top))",
    borderBottom: `1px solid ${T.border}`,
    background: `${T.obsidian}E0`,
    backdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 100,
  }}>
    <button onClick={onBack} style={{ color: T.amber, fontSize: 22, lineHeight: 1, padding: "4px 0" }}>
      {onBack ? "←" : ""}
    </button>
    <span style={{ fontFamily: "Playfair Display", fontSize: 17, color: T.cream, letterSpacing: "0.02em" }}>
      {title}
    </span>
    <div style={{ minWidth: 32 }}>{rightAction}</div>
  </div>
);

// Primary CTA button
const PrimaryButton = ({ children, onClick, disabled, loading, style = {} }) => (
  <button
    onClick={disabled || loading ? undefined : onClick}
    style={{
      width: "100%", padding: "18px 24px",
      background: disabled
        ? T.surface
        : `linear-gradient(135deg, ${T.amber} 0%, ${T.amberHi} 100%)`,
      color: disabled ? T.creamLow : T.obsidian,
      fontFamily: "DM Sans", fontWeight: 600, fontSize: 16,
      borderRadius: T.rm, letterSpacing: "0.04em",
      transition: "opacity 0.2s, transform 0.15s",
      opacity: disabled ? 0.5 : 1,
      transform: "scale(1)",
      boxShadow: disabled ? "none" : `0 8px 32px rgba(200,146,42,0.25)`,
      ...style,
    }}
    onMouseDown={e => !disabled && (e.currentTarget.style.transform = "scale(0.98)")}
    onMouseUp={e => !disabled && (e.currentTarget.style.transform = "scale(1)")}
  >
    {loading ? (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div style={{ width: 18, height: 18, border: `2px solid ${T.obsidian}40`,
                      borderTopColor: T.obsidian, borderRadius: "50%",
                      animation: "spin 0.8s linear infinite" }} />
        Processing…
      </div>
    ) : children}
  </button>
);

// Ghost / secondary button
const GhostButton = ({ children, onClick, style = {} }) => (
  <button onClick={onClick} style={{
    width: "100%", padding: "16px 24px",
    background: "transparent",
    border: `1px solid ${T.border}`,
    color: T.creamMid, fontFamily: "DM Sans", fontWeight: 400, fontSize: 15,
    borderRadius: T.rm, letterSpacing: "0.02em",
    transition: "border-color 0.2s, color 0.2s",
    ...style,
  }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = T.amber; e.currentTarget.style.color = T.cream; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.creamMid; }}
  >
    {children}
  </button>
);

// Card container
const Card = ({ children, style = {}, glow = false }) => (
  <div style={{
    background: T.surface, borderRadius: T.rl,
    border: `1px solid ${glow ? T.amber + "40" : T.border}`,
    boxShadow: glow ? `0 0 40px ${T.amberGlow}` : "none",
    overflow: "hidden", ...style,
  }}>
    {children}
  </div>
);

// Iris graphic — decorative eye motif
const IrisMotif = ({ size = 200, opacity = 0.18, animate = false }) => (
  <svg width={size} height={size} viewBox="0 0 200 200"
    style={{ opacity, animation: animate ? "ringPulse 3s ease-in-out infinite" : "none" }}>
    <defs>
      <radialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor={T.amber}   stopOpacity="1" />
        <stop offset="40%"  stopColor={T.gold}    stopOpacity="0.6" />
        <stop offset="100%" stopColor={T.amber}   stopOpacity="0" />
      </radialGradient>
    </defs>
    {[100, 88, 76, 64, 52, 40, 28].map((r, i) => (
      <circle key={i} cx="100" cy="100" r={r}
        fill="none" stroke={T.amber}
        strokeWidth={i === 0 ? 0.3 : 0.5}
        opacity={0.3 - i * 0.03} />
    ))}
    {Array.from({ length: 24 }).map((_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const x1 = 100 + Math.cos(angle) * 30;
      const y1 = 100 + Math.sin(angle) * 30;
      const x2 = 100 + Math.cos(angle) * 95;
      const y2 = 100 + Math.sin(angle) * 95;
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={T.amber} strokeWidth="0.4" opacity="0.25" />;
    })}
    <circle cx="100" cy="100" r="18" fill={T.amber} opacity="0.9" />
    <circle cx="100" cy="100" r="8"  fill={T.obsidian} />
    <circle cx="93"  cy="93"  r="2.5" fill="white" opacity="0.9" />
  </svg>
);

// Risk indicator badge
const RiskBadge = ({ label, score, level }) => {
  const colors = { low: T.teal, moderate: T.gold, elevated: T.red };
  const bgs    = { low: T.tealSoft, moderate: T.amberSoft, elevated: T.redSoft };
  const c = colors[level] || T.creamMid;
  const bg = bgs[level] || T.surface;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px", background: bg,
      borderRadius: T.r, border: `1px solid ${c}30`,
    }}>
      <span style={{ color: T.creamMid, fontSize: 13, fontWeight: 400 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 60, height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${score * 100}%`, height: "100%", background: c, borderRadius: 2,
                        transition: "width 1s ease" }} />
        </div>
        <span style={{ color: c, fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: "right",
                       textTransform: "uppercase", letterSpacing: "0.06em" }}>{level}</span>
      </div>
    </div>
  );
};

// Animated number counter
const AnimatedNumber = ({ value, suffix = "", decimals = 1 }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0; const end = parseFloat(value);
    const duration = 1200; const step = 16;
    const increment = (end - start) / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(start);
    }, step);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toFixed(decimals)}{suffix}</span>;
};

// Bottom tab bar
const TabBar = ({ active, onChange }) => {
  const tabs = [
    { id: "scan",    icon: "◎", label: "Scan"    },
    { id: "results", icon: "◈", label: "Results" },
    { id: "history", icon: "◫", label: "History" },
    { id: "profile", icon: "◯", label: "Profile" },
  ];
  return (
    <div style={{
      display: "flex", background: T.obsidian2,
      borderTop: `1px solid ${T.border}`,
      paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
    }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4, paddingTop: 12,
            color: active === tab.id ? T.amber : T.creamLow,
            transition: "color 0.2s",
          }}>
          <span style={{ fontSize: active === tab.id ? 22 : 20, lineHeight: 1 }}>{tab.icon}</span>
          <span style={{ fontSize: 10, fontWeight: active === tab.id ? 600 : 400,
                         letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
};


// ─── SCREEN 1: ONBOARDING ────────────────────────────────────
const OnboardingScreen = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const slides = [
    {
      icon: <IrisMotif size={180} opacity={0.9} animate />,
      headline: "Your eye reveals\neverything.",
      sub: "Glauc analyses the external eye to detect ocular aging and early risk signals — before symptoms appear.",
    },
    {
      icon: (
        <div style={{ position: "relative", width: 180, height: 180 }}>
          <IrisMotif size={180} opacity={0.3} />
          <div style={{ position: "absolute", inset: 0, display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {["Glaucoma", "Retinopathy", "Cardiovascular"].map((l, i) => (
              <div key={i} style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 20, padding: "5px 14px",
                fontSize: 12, color: T.creamMid, letterSpacing: "0.04em",
                animation: `fadeUp 0.4s ease ${i * 0.15}s both`,
              }}>{l}</div>
            ))}
          </div>
        </div>
      ),
      headline: "Three risk signals.\nOne image.",
      sub: "DINOv3 and Qwen3-VL analyse your eye photo in seconds, screening for early markers of ocular and systemic disease.",
    },
    {
      icon: (
        <div style={{ position: "relative", width: 180, height: 180,
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IrisMotif size={180} opacity={0.25} />
          <div style={{ position: "absolute", textAlign: "center" }}>
            <div style={{ fontFamily: "Playfair Display", fontSize: 52, color: T.amber, lineHeight: 1 }}>38</div>
            <div style={{ fontSize: 12, color: T.creamMid, marginTop: 4 }}>Ocular Age</div>
            <div style={{ fontSize: 11, color: T.teal, marginTop: 2 }}>↓ 3 yrs since Jan</div>
          </div>
        </div>
      ),
      headline: "Track your progress\nover time.",
      sub: "Retest every 90 days to see if your ocular age is improving. Lifestyle changes reflected in your eye.",
    },
  ];

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: `radial-gradient(ellipse at 50% 20%, ${T.amberGlow} 0%, ${T.obsidian} 60%)`,
    }}>
      {/* Skip */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "20px 24px",
                    paddingTop: "calc(20px + env(safe-area-inset-top))" }}>
        <button onClick={onComplete} style={{ color: T.creamLow, fontSize: 14 }}>Skip</button>
      </div>

      {/* Slide */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", padding: "0 40px", gap: 40 }}>
        <div key={step} style={{ animation: "fadeIn 0.5s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 48 }}>
            {slides[step].icon}
          </div>
          <h1 style={{
            fontFamily: "Playfair Display", fontSize: 32, fontWeight: 500,
            color: T.cream, textAlign: "center", lineHeight: 1.25,
            whiteSpace: "pre-line", marginBottom: 20,
          }}>
            {slides[step].headline}
          </h1>
          <p style={{ color: T.creamMid, fontSize: 15, textAlign: "center",
                      lineHeight: 1.7, fontWeight: 300 }}>
            {slides[step].sub}
          </p>
        </div>
      </div>

      {/* Dots + CTA */}
      <div style={{ padding: "0 32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 32 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 24 : 8, height: 8,
              borderRadius: 4, background: i === step ? T.amber : T.border,
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>
        {step < slides.length - 1
          ? <PrimaryButton onClick={() => setStep(s => s + 1)}>Continue →</PrimaryButton>
          : <PrimaryButton onClick={onComplete}>Get Started</PrimaryButton>
        }
      </div>
    </div>
  );
};


// ─── SCREEN 2: CAMERA / UPLOAD ───────────────────────────────
const CameraScreen = ({ onCapture }) => {
  const [mode, setMode] = useState("guide");    // guide | preview | uploading
  const [imageURL, setImageURL] = useState(null);
  const [metadata, setMetadata] = useState({ gender: "", race: "", age: "" });
  const [step, setStep] = useState("capture");  // capture | meta
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageURL(url);
    setMode("preview");
    setStep("meta");
  };

  const handleSubmit = () => {
    if (!metadata.gender || !metadata.race || !metadata.age) return;
    setMode("uploading");
    // Simulate API call
    setTimeout(() => onCapture({ imageURL, metadata }), 2800);
  };

  const tips = [
    "Hold phone 25–30 cm from your eye",
    "Ensure bright, even lighting — no shadows",
    "Keep your eye wide open, look straight ahead",
    "Remove glasses and contacts before scanning",
  ];

  if (step === "meta" && imageURL) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.obsidian }}>
        <NavBar title="Patient Details" onBack={() => { setStep("capture"); setMode("guide"); setImageURL(null); }} />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 120px" }}>

          {/* Preview thumb */}
          <Card style={{ marginBottom: 24 }}>
            <div style={{ position: "relative", height: 160, overflow: "hidden" }}>
              <img src={imageURL} alt="Eye capture"
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, #0A0A0F 0%, transparent 60%)",
              }} />
              <div style={{
                position: "absolute", bottom: 16, left: 16,
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 20, padding: "4px 12px",
                fontSize: 12, color: T.teal,
              }}>
                ✓ Image captured
              </div>
            </div>
          </Card>

          <h2 style={{ fontFamily: "Playfair Display", fontSize: 22, color: T.cream, marginBottom: 8 }}>
            Tell us about yourself
          </h2>
          <p style={{ color: T.creamMid, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
            Demographics help our model give you more accurate, personalised predictions.
          </p>

          {/* Age */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", color: T.creamMid, fontSize: 12,
                            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Age
            </label>
            <input
              type="number" placeholder="Your age in years"
              value={metadata.age}
              onChange={e => setMetadata(m => ({ ...m, age: e.target.value }))}
              style={{
                width: "100%", padding: "16px", background: T.surface,
                border: `1px solid ${metadata.age ? T.amber + "60" : T.border}`,
                borderRadius: T.r, color: T.cream, fontSize: 15,
                outline: "none", transition: "border-color 0.2s",
              }}
            />
          </div>

          {/* Gender */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", color: T.creamMid, fontSize: 12,
                            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Gender
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {["M", "F", "Other"].map(g => (
                <button key={g} onClick={() => setMetadata(m => ({ ...m, gender: g }))}
                  style={{
                    padding: "14px 0",
                    background: metadata.gender === g ? T.amberGlow : T.surface,
                    border: `1px solid ${metadata.gender === g ? T.amber : T.border}`,
                    borderRadius: T.r, color: metadata.gender === g ? T.amber : T.creamMid,
                    fontWeight: metadata.gender === g ? 600 : 400, fontSize: 14,
                    transition: "all 0.2s",
                  }}>
                  {g === "M" ? "Male" : g === "F" ? "Female" : "Other"}
                </button>
              ))}
            </div>
          </div>

          {/* Race/Ethnicity */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: "block", color: T.creamMid, fontSize: 12,
                            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Race / Ethnicity
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {["Asian", "Black", "Hispanic", "White", "Mixed", "Other"].map(r => (
                <button key={r} onClick={() => setMetadata(m => ({ ...m, race: r }))}
                  style={{
                    padding: "13px 0",
                    background: metadata.race === r ? T.amberGlow : T.surface,
                    border: `1px solid ${metadata.race === r ? T.amber : T.border}`,
                    borderRadius: T.r, color: metadata.race === r ? T.amber : T.creamMid,
                    fontWeight: metadata.race === r ? 600 : 400, fontSize: 13,
                    transition: "all 0.2s",
                  }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky CTA */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "16px 24px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          background: `linear-gradient(to top, ${T.obsidian} 80%, transparent)`,
        }}>
          <PrimaryButton
            onClick={handleSubmit}
            loading={mode === "uploading"}
            disabled={!metadata.gender || !metadata.race || !metadata.age}>
            Analyse My Eye →
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.obsidian }}>
      <div style={{ padding: "20px 24px", paddingTop: "calc(20px + env(safe-area-inset-top))" }}>
        <h1 style={{ fontFamily: "Playfair Display", fontSize: 26, color: T.cream, marginBottom: 4 }}>
          Eye Scan
        </h1>
        <p style={{ color: T.creamMid, fontSize: 14 }}>Position your eye within the guide</p>
      </div>

      {/* Viewfinder */}
      <div style={{ flex: 1, position: "relative", margin: "0 24px",
                    background: T.surface, borderRadius: T.rxl, overflow: "hidden",
                    border: `1px solid ${T.border}` }}>
        {/* Iris overlay guide */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <IrisMotif size={220} opacity={0.35} animate />
        </div>

        {/* Corner brackets */}
        {[["0","0","bottom","right"],["0","auto","bottom","left"],
          ["auto","0","top","right"],["auto","auto","top","left"]].map(([t,r,b,l], i) => (
          <div key={i} style={{
            position: "absolute", top: t === "auto" ? "auto" : "20px",
            right: r === "auto" ? "auto" : "20px",
            bottom: b === "top" ? "auto" : "20px",
            left: l === "auto" ? "auto" : "20px",
            width: 28, height: 28,
            borderTop: (i < 2) ? `2px solid ${T.amber}` : "none",
            borderBottom: (i >= 2) ? `2px solid ${T.amber}` : "none",
            borderLeft: (i === 1 || i === 3) ? `2px solid ${T.amber}` : "none",
            borderRight: (i === 0 || i === 2) ? `2px solid ${T.amber}` : "none",
            borderRadius: i < 2
              ? (i === 0 ? "0 0 0 0" : "0 0 0 0")
              : "0 0 0 0",
          }} />
        ))}

        {/* Scan line */}
        <div style={{
          position: "absolute", left: "10%", right: "10%", height: 1,
          background: `linear-gradient(90deg, transparent, ${T.amber}, transparent)`,
          animation: "scanLine 2.5s ease-in-out infinite",
        }} />

        {/* Centre reticle */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 80, height: 80,
        }}>
          <div style={{
            position: "absolute", inset: 0, border: `1px solid ${T.amber}50`,
            borderRadius: "50%", animation: "ringPulse 2s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", inset: 8, border: `1px solid ${T.amber}80`,
            borderRadius: "50%",
          }} />
          <div style={{
            position: "absolute", inset: "calc(50% - 3px)", width: 6, height: 6,
            background: T.amber, borderRadius: "50%",
          }} />
        </div>

        {/* Instruction label */}
        <div style={{
          position: "absolute", bottom: 20, left: 0, right: 0,
          display: "flex", justifyContent: "center",
        }}>
          <div style={{
            background: `${T.obsidian}CC`, backdropFilter: "blur(8px)",
            border: `1px solid ${T.border}`, borderRadius: 20,
            padding: "8px 18px", fontSize: 13, color: T.creamMid,
          }}>
            Centre your eye in the guide
          </div>
        </div>
      </div>

      {/* Tips */}
      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {tips.map((tip, i) => (
            <div key={i} style={{
              flexShrink: 0, background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.r, padding: "10px 14px",
              fontSize: 12, color: T.creamMid, maxWidth: 180, lineHeight: 1.5,
            }}>
              <span style={{ color: T.amber, marginRight: 6 }}>0{i+1}</span>{tip}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: "0 24px", paddingBottom: "calc(20px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          onChange={handleFile} style={{ display: "none" }} />
        <PrimaryButton onClick={() => fileRef.current?.click()}>
          Take Photo
        </PrimaryButton>
        <GhostButton onClick={() => fileRef.current?.click()}>
          Upload from Library
        </GhostButton>
      </div>
    </div>
  );
};


// ─── SCREEN 3: PROCESSING ────────────────────────────────────
const ProcessingScreen = () => {
  const [stage, setStage] = useState(0);
  const stages = [
    { label: "Detecting eye region",      duration: 800  },
    { label: "Quality validation",        duration: 600  },
    { label: "DINOv3 feature extraction", duration: 1000 },
    { label: "MC Dropout inference",      duration: 900  },
    { label: "Qwen3-VL analysis",         duration: 1200 },
    { label: "Calibrating confidence",    duration: 500  },
  ];

  useEffect(() => {
    let t = 0;
    stages.forEach((s, i) => {
      t += s.duration;
      setTimeout(() => setStage(i + 1), t);
    });
  }, []);

  const progress = (stage / stages.length) * 100;

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: `radial-gradient(ellipse at 50% 30%, ${T.amberGlow} 0%, ${T.obsidian} 65%)`,
      padding: "40px 32px",
    }}>
      {/* Animated iris */}
      <div style={{ position: "relative", marginBottom: 48 }}>
        <div style={{ animation: "ringPulse 2s ease-in-out infinite" }}>
          <IrisMotif size={160} opacity={0.7} />
        </div>
        <div style={{
          position: "absolute", inset: -20,
          border: `1px solid ${T.amber}20`,
          borderRadius: "50%",
          animation: "ringPulse 2s ease-in-out infinite 0.5s",
        }} />
        <div style={{
          position: "absolute", inset: -40,
          border: `1px solid ${T.amber}10`,
          borderRadius: "50%",
          animation: "ringPulse 2s ease-in-out infinite 1s",
        }} />
      </div>

      <h2 style={{ fontFamily: "Playfair Display", fontSize: 26, color: T.cream,
                   textAlign: "center", marginBottom: 12 }}>
        Analysing your eye
      </h2>
      <p style={{ color: T.creamMid, fontSize: 14, textAlign: "center",
                  lineHeight: 1.7, marginBottom: 40, maxWidth: 260 }}>
        Our AI models are working — this takes about 10–15 seconds
      </p>

      {/* Progress bar */}
      <div style={{ width: "100%", marginBottom: 32 }}>
        <div style={{ height: 2, background: T.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: `linear-gradient(90deg, ${T.amber}, ${T.amberHi})`,
            width: `${progress}%`,
            transition: "width 0.5s ease",
            boxShadow: `0 0 12px ${T.amber}80`,
          }} />
        </div>
      </div>

      {/* Stage list */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 14,
            opacity: i < stage ? 1 : i === stage ? 0.5 : 0.2,
            transition: "opacity 0.4s ease",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: i < stage ? T.amber : i === stage ? "transparent" : T.border,
              border: i === stage ? `2px solid ${T.amber}` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: i === stage ? "spin 1s linear infinite" : "none",
            }}>
              {i < stage && <span style={{ color: T.obsidian, fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: 14, color: i < stage ? T.cream : T.creamMid }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};


// ─── SCREEN 4: RESULTS ───────────────────────────────────────
const ResultsScreen = ({ data, onRescan }) => {
  const [tabIdx, setTabIdx] = useState(0);
  const [expExpanded, setExpExpanded] = useState(false);

  const ocularAge  = data?.ocularAge  ?? 41.2;
  const actualAge  = data?.actualAge  ?? 38;
  const ci95       = data?.ci95       ?? 2.4;
  const gap        = ocularAge - actualAge;
  const gapLabel   = gap > 1 ? `${gap.toFixed(1)} yrs older` : gap < -1 ? `${Math.abs(gap).toFixed(1)} yrs younger` : "On track";
  const gapColor   = gap > 3 ? T.red : gap > 1 ? T.gold : gap < -1 ? T.teal : T.teal;

  const risks = [
    { label: "Glaucoma Risk",           score: data?.glaucRisk  ?? 0.12, level: "low"      },
    { label: "Diabetic Retinopathy",    score: data?.drRisk     ?? 0.08, level: "low"      },
    { label: "Cardiovascular Proxy",    score: data?.cardioRisk ?? 0.31, level: "moderate" },
  ];

  const explanation = data?.explanation ??
    "The anterior eye presents with high scleral clarity and a well-defined limbal ring, consistent with the predicted ocular age of 41.2 years. The conjunctival vasculature appears within normal limits with no visible vascular tortuosity. The periocular tissue shows early fine-line development at the lateral canthus, expected for the demographic profile. The cardiovascular proxy score of 0.31 warrants monitoring — consider lifestyle review and retest in 90 days.";

  const tabs = ["Overview", "Risk Analysis", "AI Report"];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.obsidian }}>
      <NavBar title="Your Results" onBack={onRescan}
        rightAction={
          <button style={{ color: T.amber, fontSize: 13 }} onClick={() => {}}>Share</button>
        }
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Hero score */}
        <div style={{
          position: "relative", padding: "40px 24px 32px",
          background: `radial-gradient(ellipse at 50% 0%, ${T.amberGlow} 0%, transparent 70%)`,
          textAlign: "center", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)" }}>
            <IrisMotif size={280} opacity={0.08} />
          </div>

          <div style={{ color: T.creamMid, fontSize: 13, letterSpacing: "0.1em",
                        textTransform: "uppercase", marginBottom: 16 }}>
            Ocular Age
          </div>

          <div style={{
            fontFamily: "Playfair Display", fontSize: 80, fontWeight: 500,
            color: T.cream, lineHeight: 1,
            animation: "countUp 0.6s ease 0.2s both",
          }}>
            <AnimatedNumber value={ocularAge} decimals={1} />
          </div>

          <div style={{ color: T.creamMid, fontSize: 14, marginTop: 8 }}>
            years  ·  ±{ci95} CI
          </div>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            marginTop: 20, padding: "8px 20px",
            background: `${gapColor}18`,
            border: `1px solid ${gapColor}40`,
            borderRadius: 20, color: gapColor,
            fontSize: 14, fontWeight: 500,
            animation: "countUp 0.6s ease 0.5s both",
          }}>
            <span style={{ fontSize: 16 }}>{gap > 1 ? "↑" : gap < -1 ? "↓" : "→"}</span>
            {gapLabel} than chronological age
          </div>

          {/* Score gauge */}
          <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
            <ScoreGauge value={ocularAge} max={80} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`,
                      position: "sticky", top: 57, background: T.obsidian, zIndex: 10 }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setTabIdx(i)}
              style={{
                flex: 1, padding: "14px 0", fontSize: 13, fontWeight: 500,
                color: tabIdx === i ? T.amber : T.creamLow,
                borderBottom: tabIdx === i ? `2px solid ${T.amber}` : "2px solid transparent",
                transition: "color 0.2s",
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: "24px", paddingBottom: 40 }}>
          {tabIdx === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn 0.3s ease" }}>
              {/* Quick stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Chronological Age", value: `${actualAge}y`, color: T.creamMid },
                  { label: "Ocular Age",         value: `${ocularAge.toFixed(1)}y`, color: T.amber },
                  { label: "Age Gap",            value: `${gap > 0 ? "+" : ""}${gap.toFixed(1)}y`, color: gapColor },
                  { label: "Confidence (95%)",   value: `±${ci95}y`, color: T.teal },
                ].map((s, i) => (
                  <Card key={i} style={{ padding: "16px" }}>
                    <div style={{ color: T.creamMid, fontSize: 11, letterSpacing: "0.06em",
                                  textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontFamily: "Playfair Display", fontSize: 26,
                                  color: s.color, fontWeight: 500 }}>{s.value}</div>
                  </Card>
                ))}
              </div>

              {/* What this means */}
              <Card style={{ padding: "20px" }}>
                <h3 style={{ fontFamily: "Playfair Display", fontSize: 18, color: T.cream,
                              marginBottom: 12 }}>What this means</h3>
                <p style={{ color: T.creamMid, fontSize: 14, lineHeight: 1.75 }}>
                  Your ocular age of <strong style={{ color: T.amber }}>{ocularAge.toFixed(1)}</strong> is{" "}
                  {Math.abs(gap) < 1 ? "closely aligned with" : gap > 0 ? "slightly above" : "below"}{" "}
                  your chronological age of {actualAge}. {gap > 2
                    ? "This may indicate early signs of ocular stress — consider a specialist consultation."
                    : gap < -1
                    ? "This suggests your ocular health is in excellent shape for your age."
                    : "Your ocular health appears normal for your age group."}
                </p>
              </Card>

              {/* Next steps */}
              <Card style={{ padding: "20px" }}>
                <h3 style={{ fontFamily: "Playfair Display", fontSize: 18, color: T.cream,
                              marginBottom: 16 }}>Recommended next steps</h3>
                {[
                  { icon: "◎", text: "Retest in 90 days to track your trajectory" },
                  { icon: "◈", text: "Review your sleep and hydration — both impact ocular aging" },
                  { icon: "◫", text: "Consider a comprehensive eye exam with an optometrist" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, marginBottom: i < 2 ? 16 : 0 }}>
                    <span style={{ color: T.amber, fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ color: T.creamMid, fontSize: 14, lineHeight: 1.6 }}>{item.text}</span>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {tabIdx === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeIn 0.3s ease" }}>
              <div style={{ color: T.creamMid, fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>
                These scores are early screening indicators — not diagnoses. Scores above 0.5 warrant specialist review.
              </div>
              {risks.map((r, i) => <RiskBadge key={i} {...r} />)}
              <Card style={{ padding: "16px", marginTop: 8 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 20 }}>⚠</span>
                  <p style={{ color: T.creamMid, fontSize: 13, lineHeight: 1.7 }}>
                    Disease risk scores are placeholder outputs pending clinical validation.
                    Do not use for diagnostic purposes without specialist review.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {tabIdx === 2 && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <IrisMotif size={36} opacity={0.8} />
                <div>
                  <div style={{ fontFamily: "Playfair Display", fontSize: 16, color: T.cream }}>
                    Qwen3-VL Clinical Analysis
                  </div>
                  <div style={{ fontSize: 12, color: T.creamMid }}>AI-generated — not a medical diagnosis</div>
                </div>
              </div>

              <Card style={{ padding: "20px" }} glow>
                <p style={{
                  color: T.creamMid, fontSize: 14, lineHeight: 1.85,
                  overflow: "hidden",
                  maxHeight: expExpanded ? "none" : "200px",
                  WebkitMaskImage: expExpanded ? "none"
                    : "linear-gradient(to bottom, black 60%, transparent 100%)",
                }}>
                  {explanation}
                </p>
                <button onClick={() => setExpExpanded(e => !e)}
                  style={{ color: T.amber, fontSize: 13, marginTop: 12 }}>
                  {expExpanded ? "Show less ↑" : "Read full report ↓"}
                </button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ padding: "12px 24px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
                    borderTop: `1px solid ${T.border}`, background: T.obsidian }}>
        <GhostButton onClick={onRescan} style={{ width: "100%" }}>
          Scan Again
        </GhostButton>
      </div>
    </div>
  );
};

// Score gauge component
const ScoreGauge = ({ value, max = 80 }) => {
  const pct = Math.min(value / max, 1);
  const angle = -140 + pct * 280;
  const color = pct < 0.4 ? T.teal : pct < 0.65 ? T.gold : T.red;
  return (
    <svg width={200} height={110} viewBox="0 0 200 110">
      <path d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none" stroke={T.border} strokeWidth="8" strokeLinecap="round" />
      <path d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none" stroke={`url(#gaugeGrad)`} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${pct * 251.2} 251.2`} />
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={T.teal} />
          <stop offset="50%"  stopColor={T.gold} />
          <stop offset="100%" stopColor={T.red}  />
        </linearGradient>
      </defs>
      {/* Needle */}
      <g transform={`rotate(${angle}, 100, 100)`}>
        <line x1="100" y1="100" x2="100" y2="28" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="100" r="5" fill={color} />
      </g>
      <text x="100" y="118" textAnchor="middle" fill={T.creamMid} fontSize="11"
            fontFamily="DM Sans">Ocular Age Scale</text>
    </svg>
  );
};


// ─── SCREEN 5: HISTORY / TREND ───────────────────────────────
const HistoryScreen = () => {
  const sessions = [
    { date: "Apr 12 2026", age: 41.2, gap: +3.2, ci: 2.4 },
    { date: "Jan 08 2026", age: 43.1, gap: +5.1, ci: 2.8 },
    { date: "Oct 14 2025", age: 44.6, gap: +6.6, ci: 3.1 },
    { date: "Jul 21 2025", age: 46.0, gap: +8.0, ci: 3.4 },
  ];

  const chartH   = 120;
  const ages     = sessions.map(s => s.age).reverse();
  const minAge   = Math.min(...ages) - 2;
  const maxAge   = Math.max(...ages) + 2;
  const points   = ages.map((a, i) => ({
    x: 32 + (i / (ages.length - 1)) * (300 - 64),
    y: chartH - ((a - minAge) / (maxAge - minAge)) * chartH,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length-1].x} ${chartH+10} L ${points[0].x} ${chartH+10} Z`;

  const ratePerYear = -1.56; // years of improvement per calendar year

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.obsidian }}>
      <NavBar title="Ocular Age History" />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px", paddingBottom: 40 }}>
        {/* Rate summary */}
        <Card style={{ padding: "20px", marginBottom: 24 }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: T.creamMid, fontSize: 12, letterSpacing: "0.08em",
                            textTransform: "uppercase", marginBottom: 8 }}>
                Rate of Change
              </div>
              <div style={{ fontFamily: "Playfair Display", fontSize: 36,
                            color: T.teal, lineHeight: 1 }}>
                −1.56
              </div>
              <div style={{ color: T.creamMid, fontSize: 13, marginTop: 4 }}>
                years improvement / calendar year
              </div>
            </div>
            <div style={{
              background: T.tealSoft, border: `1px solid ${T.teal}30`,
              borderRadius: 20, padding: "6px 14px",
              fontSize: 12, color: T.teal, fontWeight: 600,
            }}>
              ↓ Improving
            </div>
          </div>
        </Card>

        {/* Trend chart */}
        <Card style={{ padding: "20px", marginBottom: 24 }}>
          <h3 style={{ fontFamily: "Playfair Display", fontSize: 18, color: T.cream, marginBottom: 20 }}>
            Ocular Age Trend
          </h3>
          <svg width="100%" viewBox={`0 0 300 ${chartH + 20}`} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={T.amber} stopOpacity="0.3" />
                <stop offset="100%" stopColor={T.amber} stopOpacity="0"   />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
              <line key={i} x1="0" y1={chartH * f} x2="300" y2={chartH * f}
                stroke={T.border} strokeWidth="1" />
            ))}
            {/* Area fill */}
            <path d={areaD} fill="url(#areaGrad)" />
            {/* Line */}
            <path d={pathD} fill="none" stroke={T.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Points + labels */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="5" fill={T.amber} />
                <circle cx={p.x} cy={p.y} r="9" fill={T.amber} fillOpacity="0.2" />
                <text x={p.x} y={p.y - 14} textAnchor="middle"
                  fill={T.cream} fontSize="11" fontFamily="DM Sans">
                  {ages[i].toFixed(1)}
                </text>
              </g>
            ))}
            {/* X labels */}
            {sessions.map((s, i) => {
              const idx = sessions.length - 1 - i;
              return (
                <text key={i} x={points[i].x} y={chartH + 18}
                  textAnchor="middle" fill={T.creamLow} fontSize="9" fontFamily="DM Sans">
                  {sessions[idx].date.slice(0, 6)}
                </text>
              );
            })}
          </svg>
        </Card>

        {/* Session list */}
        <h3 style={{ fontFamily: "Playfair Display", fontSize: 18, color: T.cream, marginBottom: 16 }}>
          All Sessions
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s, i) => (
            <Card key={i} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: T.creamMid, fontSize: 12, marginBottom: 4 }}>{s.date}</div>
                  <div style={{ fontFamily: "Playfair Display", fontSize: 22, color: T.cream }}>
                    {s.age.toFixed(1)}
                    <span style={{ fontSize: 13, color: T.creamMid, fontFamily: "DM Sans",
                                   fontWeight: 300, marginLeft: 6 }}>yrs ocular</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    color: s.gap > 3 ? T.red : s.gap > 0 ? T.gold : T.teal,
                    fontSize: 15, fontWeight: 600,
                  }}>
                    {s.gap > 0 ? "+" : ""}{s.gap.toFixed(1)}y
                  </div>
                  <div style={{ color: T.creamLow, fontSize: 11, marginTop: 2 }}>
                    ±{s.ci} CI
                  </div>
                </div>
              </div>
              {i === 0 && (
                <div style={{
                  marginTop: 10, padding: "6px 12px",
                  background: T.amberSoft, border: `1px solid ${T.amber}30`,
                  borderRadius: 6, fontSize: 12, color: T.amber,
                }}>
                  Latest result
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};


// ─── SCREEN 6: PROFILE ───────────────────────────────────────
const ProfileScreen = ({ onSignOut }) => {
  const settings = [
    { section: "Account",     items: [
      { label: "Personal Details",      icon: "◯", action: () => {} },
      { label: "Notification Settings", icon: "◈", action: () => {} },
      { label: "Privacy & Data",        icon: "◉", action: () => {} },
    ]},
    { section: "App",         items: [
      { label: "Scan Reminders",        icon: "◎", action: () => {} },
      { label: "Units & Display",       icon: "◫", action: () => {} },
      { label: "Export My Data",        icon: "◧", action: () => {} },
    ]},
    { section: "Information", items: [
      { label: "How Glauc Works",       icon: "◌", action: () => {} },
      { label: "Clinical Disclaimer",   icon: "◍", action: () => {} },
      { label: "Feedback",              icon: "◐", action: () => {} },
    ]},
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.obsidian }}>
      <NavBar title="Profile" />
      <div style={{ flex: 1, overflowY: "auto", padding: "24px", paddingBottom: 40 }}>

        {/* User card */}
        <Card style={{ padding: "24px", marginBottom: 28 }} glow>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `linear-gradient(135deg, ${T.amber}, ${T.gold})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
              <IrisMotif size={56} opacity={0.9} />
            </div>
            <div>
              <div style={{ fontFamily: "Playfair Display", fontSize: 20, color: T.cream }}>
                Sarvesh R.
              </div>
              <div style={{ color: T.creamMid, fontSize: 13, marginTop: 2 }}>
                Member since Oct 2025
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { label: "Scans",    value: "4"    },
              { label: "Ocular Age", value: "41.2" },
              { label: "Trend",    value: "↓ −1.6" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "Playfair Display", fontSize: 20,
                              color: i === 2 ? T.teal : T.cream }}>{s.value}</div>
                <div style={{ fontSize: 11, color: T.creamLow, marginTop: 4,
                              textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Reminder card */}
        <Card style={{ padding: "16px 20px", marginBottom: 28, border: `1px solid ${T.amber}30` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: T.amber, fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                Next scan recommended
              </div>
              <div style={{ color: T.creamMid, fontSize: 13 }}>July 12, 2026  (90 days)</div>
            </div>
            <button style={{
              background: T.amberGlow, border: `1px solid ${T.amber}40`,
              borderRadius: 8, padding: "8px 14px",
              color: T.amber, fontSize: 13, fontWeight: 500,
            }}>
              Set Reminder
            </button>
          </div>
        </Card>

        {/* Settings */}
        {settings.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 24 }}>
            <div style={{ color: T.creamLow, fontSize: 11, letterSpacing: "0.1em",
                          textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>
              {group.section}
            </div>
            <Card>
              {group.items.map((item, ii) => (
                <button key={ii} onClick={item.action}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: ii < group.items.length - 1 ? `1px solid ${T.border}` : "none",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surfaceHi}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ color: T.amber, fontSize: 16 }}>{item.icon}</span>
                    <span style={{ color: T.cream, fontSize: 14 }}>{item.label}</span>
                  </div>
                  <span style={{ color: T.creamLow, fontSize: 18 }}>›</span>
                </button>
              ))}
            </Card>
          </div>
        ))}

        {/* Sign out */}
        <button onClick={onSignOut}
          style={{
            width: "100%", padding: "16px",
            background: T.redSoft, border: `1px solid ${T.red}30`,
            borderRadius: T.r, color: T.red,
            fontSize: 14, fontWeight: 500,
          }}>
          Sign Out
        </button>

        <div style={{ textAlign: "center", marginTop: 24, color: T.creamLow, fontSize: 12 }}>
          Glauc v3.0 · Not a medical device · For wellness use only
        </div>
      </div>
    </div>
  );
};


// ─── ROOT APP ────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("onboarding");  // onboarding | main
  const [tab,    setTab]    = useState("scan");
  const [scanState, setScanState] = useState("idle");   // idle | processing | done
  const [results,   setResults]   = useState(null);

  const handleCapture = useCallback((data) => {
    setScanState("processing");
    // Simulate processing delay → results
    setTimeout(() => {
      setScanState("done");
      setResults({
        ocularAge:  41.2, actualAge: parseInt(data.metadata.age) || 38,
        ci95: 2.4, glaucRisk: 0.12, drRisk: 0.08, cardioRisk: 0.31,
        explanation: "The anterior eye presents with high scleral clarity and a well-defined limbal ring, consistent with the predicted ocular age of 41.2 years. Conjunctival vasculature appears within normal limits. Periocular tissue shows early fine-line development at the lateral canthus — expected for the demographic profile. The cardiovascular proxy score of 0.31 warrants monitoring. Recommend lifestyle review focusing on sleep quality and cardiovascular health, and retest in 90 days to assess trajectory.",
      });
      setTab("results");
    }, 5500);
  }, []);

  const handleRescan = useCallback(() => {
    setScanState("idle");
    setResults(null);
    setTab("scan");
  }, []);

  if (screen === "onboarding") {
    return (
      <div style={{ width: "100%", height: "100%", maxWidth: 430,
                    margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <GlobalStyle />
        <OnboardingScreen onComplete={() => setScreen("main")} />
      </div>
    );
  }

  const renderTab = () => {
    if (tab === "scan") {
      if (scanState === "processing") return <ProcessingScreen />;
      return <CameraScreen onCapture={handleCapture} />;
    }
    if (tab === "results") {
      if (!results) return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      padding: 40, gap: 20, textAlign: "center" }}>
          <IrisMotif size={100} opacity={0.3} />
          <h2 style={{ fontFamily: "Playfair Display", fontSize: 24, color: T.cream }}>
            No results yet
          </h2>
          <p style={{ color: T.creamMid, fontSize: 14, lineHeight: 1.7 }}>
            Complete a scan to see your ocular age prediction and risk analysis.
          </p>
          <PrimaryButton onClick={() => setTab("scan")} style={{ maxWidth: 280 }}>
            Take Your First Scan
          </PrimaryButton>
        </div>
      );
      return <ResultsScreen data={results} onRescan={handleRescan} />;
    }
    if (tab === "history") return <HistoryScreen />;
    if (tab === "profile") return <ProfileScreen onSignOut={() => setScreen("onboarding")} />;
  };

  return (
    <div style={{ width: "100%", height: "100%", maxWidth: 430,
                  margin: "0 auto", display: "flex", flexDirection: "column",
                  background: T.obsidian }}>
      <GlobalStyle />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {renderTab()}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
