import { useCallback, useEffect, useRef, useState } from "react"
import { io } from "socket.io-client"

import "./App.css"

const SECTION_ORDER = [
  { key: "immediate_path", label: "Immediate path" },
  { key: "upcoming_path", label: "Upcoming path" },
  { key: "clearance", label: "Left / right clearance" },
  { key: "surface", label: "Surface & elevation" },
  { key: "movement", label: "Movement instruction" },
  { key: "alert_level", label: "Alert level" },
]

const DEMO_SCENARIOS = [
  {
    title: "Open sidewalk",
    note: "A calm walkway with light foot traffic and a clear center lane.",
    guidance: `1. IMMEDIATE PATH: Path is clear.
2. UPCOMING PATH: Two people ahead on the left; center path is passable.
3. LEFT / RIGHT CLEARANCE: Right side offers more space.
4. SURFACE & ELEVATION: Flat, even sidewalk.
5. MOVEMENT INSTRUCTION: Continue forward and favor the right.
6. ALERT LEVEL: CLEAR`,
  },
  {
    title: "Narrowing corridor",
    note: "Tables or street furniture are squeezing the route and asking for a lane choice.",
    guidance: `1. IMMEDIATE PATH: Clear for the next step.
2. UPCOMING PATH: Passage narrows ahead with chairs extending from the left.
3. LEFT / RIGHT CLEARANCE: Right side is tighter; left side opens after the chairs.
4. SURFACE & ELEVATION: Smooth pavement with no visible elevation change.
5. MOVEMENT INSTRUCTION: Slow down and angle slightly left.
6. ALERT LEVEL: CAUTION`,
  },
  {
    title: "Immediate hazard",
    note: "A curb edge or blocked lane requires an immediate stop until the path is clearer.",
    guidance: `1. IMMEDIATE PATH: Obstacle directly ahead within one step.
2. UPCOMING PATH: Forward route is blocked by a low barrier.
3. LEFT / RIGHT CLEARANCE: Left side appears more open than the right.
4. SURFACE & ELEVATION: Curb edge or drop is visible near the obstruction.
5. MOVEMENT INSTRUCTION: Stop and re-center before moving left.
6. ALERT LEVEL: STOP`,
  },
]

const WELCOME_GUIDANCE = `1. IMMEDIATE PATH: Camera feed is preparing.
2. UPCOMING PATH: Live guidance will appear after the first analyzed frame.
3. LEFT / RIGHT CLEARANCE: Center path is open.
4. SURFACE & ELEVATION: Awaiting scene analysis.
5. MOVEMENT INSTRUCTION: Hold the camera chest-high and face forward.
6. ALERT LEVEL: CLEAR`

const API_BASE_URL = resolveApiBaseUrl()
const socket = io(API_BASE_URL, {
  autoConnect: true,
  reconnectionAttempts: Infinity,
  transports: ["websocket"],
})

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredUrl) {
    return configuredUrl
  }

  if (typeof window === "undefined") {
    return "http://localhost:8000"
  }

  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:8000`
}

function parseSections(text = "") {
  const sections = Object.fromEntries(SECTION_ORDER.map(({ key }) => [key, ""]))

  for (const rawLine of text.split("\n")) {
    const match = rawLine.match(/^\s*\d\.\s*([A-Z /&]+):\s*(.+?)\s*$/)
    if (!match) {
      continue
    }

    const [, heading, value] = match
    const normalizedHeading = heading.trim()
    for (const section of SECTION_ORDER) {
      if (normalizedHeading.toUpperCase() === section.label.toUpperCase()) {
        sections[section.key] = value.trim()
      }
    }
  }

  return sections
}

function extractAlertLevel(text = "", sections = parseSections(text)) {
  const candidates = [
    sections.alert_level,
    text,
  ]

  for (const candidate of candidates) {
    const upper = candidate.toUpperCase()
    if (upper.includes("STOP")) return "STOP"
    if (upper.includes("CAUTION")) return "CAUTION"
    if (upper.includes("CLEAR")) return "CLEAR"
  }

  return "CLEAR"
}

function requestPreferredCameraStream() {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  })
}

function formatTimestamp(value) {
  if (!value) {
    return "Waiting for the first update"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Waiting for the first update"
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

function choosePreferredVoice(voices) {
  return (
    voices.find((voice) => voice.name.includes("Samantha")) ||
    voices.find((voice) => voice.name.includes("Karen")) ||
    voices.find((voice) => voice.name.includes("Google US English")) ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ||
    voices[0]
  )
}

function StatusPill({ label, tone = "neutral" }) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>
}

export default function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const prevDescription = useRef("")
  const demoIndexRef = useRef(0)

  const [description, setDescription] = useState(WELCOME_GUIDANCE)
  const [sections, setSections] = useState(() => parseSections(WELCOME_GUIDANCE))
  const [alertLevel, setAlertLevel] = useState(() => extractAlertLevel(WELCOME_GUIDANCE))
  const [connected, setConnected] = useState(false)
  const [mode, setMode] = useState("live")
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isStreaming, setIsStreaming] = useState(true)
  const [muted, setMuted] = useState(false)
  const [speechRate, setSpeechRate] = useState(1.05)
  const [highContrast, setHighContrast] = useState(false)
  const [largeText, setLargeText] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [availableVoices, setAvailableVoices] = useState([])
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("")
  const [history, setHistory] = useState([])
  const [lastUpdated, setLastUpdated] = useState("")
  const [demoIndex, setDemoIndex] = useState(0)

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraReady(false)
  }, [])

  const enableLiveCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera access is not supported in this browser.")
      return
    }

    stopCameraStream()
    setErrorMessage("")

    try {
      streamRef.current = await requestPreferredCameraStream()
    } catch {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      } catch (fallbackError) {
        setErrorMessage(`Camera access is unavailable: ${fallbackError.message}`)
        return
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      try {
        await videoRef.current.play()
      } catch (playError) {
        setErrorMessage(`Camera preview could not start: ${playError.message}`)
      }
    }

    setIsCameraReady(true)
    setIsStreaming(true)
  }, [stopCameraStream])

  const speakGuidance = useCallback((text) => {
    if (muted || !text || !window.speechSynthesis) {
      return
    }

    const cleaned = text
      .replace(/\d\.\s[A-Z\s/&]+:/g, "")
      .replace(/\n+/g, ". ")
      .replace(/\s+/g, " ")
      .trim()

    if (!cleaned) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(cleaned)
    utterance.rate = speechRate
    utterance.pitch = 1
    utterance.volume = 1

    const chosenVoice =
      availableVoices.find((voice) => voice.voiceURI === selectedVoiceUri) ||
      choosePreferredVoice(availableVoices)

    if (chosenVoice) {
      utterance.voice = chosenVoice
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [availableVoices, muted, selectedVoiceUri, speechRate])

  const applyGuidanceUpdate = useCallback((payload, source) => {
    const text = payload.text || payload.description || ""
    if (!text) {
      return
    }

    const nextSections = payload.sections || parseSections(text)
    const nextAlertLevel = payload.alert_level || extractAlertLevel(text, nextSections)
    const updatedAt = payload.updated_at || new Date().toISOString()
    const summary =
      payload.summary ||
      nextSections.movement ||
      nextSections.immediate_path ||
      nextSections.upcoming_path ||
      text

    setDescription(text)
    setSections(nextSections)
    setAlertLevel(nextAlertLevel)
    setLastUpdated(updatedAt)
    prevDescription.current = text

    setHistory((current) => {
      const nextEntry = {
        id: `${updatedAt}-${source}-${nextAlertLevel}`,
        alertLevel: nextAlertLevel,
        source,
        summary,
        updatedAt,
      }

      return [nextEntry, ...current].slice(0, 5)
    })

    if (payload.changed !== false) {
      speakGuidance(text)
    }
  }, [speakGuidance])

  const playDemoScenario = useCallback((index) => {
    const scenario = DEMO_SCENARIOS[index]
    applyGuidanceUpdate(
      {
        changed: true,
        description: scenario.guidance,
        summary: scenario.note,
        updated_at: new Date().toISOString(),
      },
      "demo"
    )
  }, [applyGuidanceUpdate])

  function replayGuidance() {
    speakGuidance(description)
  }

  function openDemoMode() {
    stopCameraStream()
    setMode("demo")
    setIsStreaming(false)
    setErrorMessage("")
    demoIndexRef.current = 0
    setDemoIndex(0)
    playDemoScenario(0)
  }

  async function openLiveMode() {
    setMode("live")
    setIsStreaming(true)
    await enableLiveCamera()
  }

  useEffect(() => {
    const unlockSpeech = () => {
      window.speechSynthesis.cancel()
      window.speechSynthesis.getVoices()
      document.removeEventListener("pointerdown", unlockSpeech)
    }

    document.addEventListener("pointerdown", unlockSpeech)

    let active = true

    async function bootCamera() {
      if (!active) {
        return
      }

      await enableLiveCamera()
    }

    bootCamera()

    return () => {
      active = false
      document.removeEventListener("pointerdown", unlockSpeech)
      stopCameraStream()
      window.speechSynthesis.cancel()
    }
  }, [enableLiveCamera, stopCameraStream])

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) {
      return undefined
    }

    const loadVoices = () => {
      const voices = synth.getVoices()
      setAvailableVoices(voices)
      setSelectedVoiceUri((currentVoiceUri) => {
        if (currentVoiceUri) {
          return currentVoiceUri
        }

        return choosePreferredVoice(voices)?.voiceURI || ""
      })
    }

    loadVoices()
    synth.onvoiceschanged = loadVoices

    return () => {
      synth.onvoiceschanged = null
    }
  }, [])

  useEffect(() => {
    function handleConnect() {
      setConnected(true)
      setErrorMessage("")
    }

    function handleDisconnect() {
      setConnected(false)
    }

    function handleDescription(data) {
      if (mode !== "live" || data.changed === false) {
        return
      }

      applyGuidanceUpdate(data, "live")
    }

    function handleError(data) {
      setErrorMessage(data.message || "The server could not analyze the latest frame.")
    }

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)
    socket.on("description", handleDescription)
    socket.on("error", handleError)

    return () => {
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
      socket.off("description", handleDescription)
      socket.off("error", handleError)
    }
  }, [applyGuidanceUpdate, mode])

  useEffect(() => {
    if (mode !== "demo") {
      return undefined
    }

    const timer = window.setInterval(() => {
      const nextIndex = (demoIndexRef.current + 1) % DEMO_SCENARIOS.length
      demoIndexRef.current = nextIndex
      setDemoIndex(nextIndex)
      playDemoScenario(nextIndex)
    }, 6500)

    return () => window.clearInterval(timer)
  }, [mode, playDemoScenario])

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || !connected || !isCameraReady || !isStreaming || mode !== "live") {
      return undefined
    }

    const interval = window.setInterval(() => {
      const canvas = canvasRef.current
      const video = videoRef.current
      const context = canvas.getContext("2d")

      if (!context || !video.videoWidth || !video.videoHeight) {
        return
      }

      canvas.width = 640
      canvas.height = 480
      context.drawImage(video, 0, 0, 640, 480)

      const base64 = canvas.toDataURL("image/jpeg", 0.72).split(",")[1]
      socket.emit("frame", {
        image: base64,
        previous: prevDescription.current,
      })
    }, 900)

    return () => window.clearInterval(interval)
  }, [connected, isCameraReady, isStreaming, mode])

  const alertAppearance = {
    CLEAR: {
      accent: "clear",
      label: "Clear",
      message: "Forward path appears comfortably navigable.",
    },
    CAUTION: {
      accent: "caution",
      label: "Caution",
      message: "A lane adjustment or slower pace is recommended.",
    },
    STOP: {
      accent: "stop",
      label: "Stop",
      message: "Pause movement until the immediate path is reassessed.",
    },
  }[alertLevel]

  const currentScenario = DEMO_SCENARIOS[demoIndex]
  const summaryText =
    sections.movement ||
    sections.immediate_path ||
    "Waiting for the next navigation update."

  return (
    <div className={`app-shell ${highContrast ? "theme-contrast" : ""} ${largeText ? "theme-large" : ""}`}>
      <div className="ambient ambient--top" />
      <div className="ambient ambient--bottom" />

      <header className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">WayFree public beta prep</span>
          <h1>Realtime spoken guidance, designed like a product instead of a hackathon demo.</h1>
          <p>
            This pass turns WayFree into a stronger open-source prototype: live camera streaming,
            demo mode for contributors, structured guidance cards, and accessibility controls that
            make testing feel intentional.
          </p>
        </div>

        <div className="hero-status">
          <StatusPill
            label={connected ? "Backend connected" : "Backend disconnected"}
            tone={connected ? "clear" : "stop"}
          />
          <StatusPill
            label={mode === "live" ? "Live camera mode" : "Demo mode"}
            tone={mode === "live" ? "neutral" : "caution"}
          />
          <StatusPill
            label={muted ? "Speech muted" : "Speech enabled"}
            tone={muted ? "neutral" : "clear"}
          />
        </div>
      </header>

      <main className="workspace-grid">
        <section className="panel preview-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">Capture</span>
              <h2>Live scene intake</h2>
            </div>
            <span className={`mode-badge mode-badge--${mode}`}>{mode === "live" ? "Live feed" : "Demo preview"}</span>
          </div>

          {mode === "live" ? (
            <div className="video-stage">
              <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
              <div className="stage-overlay">
                <span>{isCameraReady ? "Camera ready" : "Waiting for camera access"}</span>
                <span>{connected ? "Streaming to model" : "Server offline or still booting"}</span>
              </div>
            </div>
          ) : (
            <div className="demo-stage">
              <span className="panel-kicker">Contributor demo</span>
              <h3>{currentScenario.title}</h3>
              <p>{currentScenario.note}</p>
              <div className="demo-grid">
                <span>Autoplay cycles through representative scenes.</span>
                <span>No API key or camera is required to try the interface.</span>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="sr-only" />

          <div className="action-row">
            <button type="button" className="primary-button" onClick={openLiveMode}>
              Use live camera
            </button>
            <button type="button" className="secondary-button" onClick={openDemoMode}>
              Open demo mode
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setIsStreaming((current) => !current)}
              disabled={mode !== "live" || !isCameraReady}
            >
              {isStreaming ? "Pause capture" : "Resume capture"}
            </button>
          </div>

          <div className="status-grid">
            <article>
              <span className="panel-kicker">Last guidance</span>
              <strong>{formatTimestamp(lastUpdated)}</strong>
            </article>
            <article>
              <span className="panel-kicker">Capture cadence</span>
              <strong>Every 900 ms</strong>
            </article>
            <article>
              <span className="panel-kicker">Target camera</span>
              <strong>Rear-facing when available</strong>
            </article>
          </div>
        </section>

        <section className={`panel guidance-panel guidance-panel--${alertAppearance.accent}`} aria-live="polite">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">Guidance</span>
              <h2>{alertAppearance.label} corridor status</h2>
            </div>
            <StatusPill label={alertAppearance.label} tone={alertAppearance.accent} />
          </div>

          <div className="summary-card">
            <p className="summary-label">Current movement summary</p>
            <p className="summary-text">{summaryText}</p>
            <p className="summary-subtext">{alertAppearance.message}</p>
          </div>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="guidance-grid">
            {SECTION_ORDER.map((section) => (
              <article key={section.key} className="guidance-card">
                <span className="guidance-card__label">{section.label}</span>
                <p>{sections[section.key] || "Awaiting model output."}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel control-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">Controls</span>
              <h2>Speech and accessibility</h2>
            </div>
          </div>

          <div className="toggle-grid">
            <button
              type="button"
              className={`toggle-button ${muted ? "is-off" : "is-on"}`}
              onClick={() => {
                setMuted((current) => !current)
                window.speechSynthesis.cancel()
              }}
            >
              {muted ? "Enable speech" : "Mute speech"}
            </button>

            <button type="button" className="toggle-button" onClick={replayGuidance}>
              Repeat latest guidance
            </button>

            <button
              type="button"
              className={`toggle-button ${highContrast ? "is-on" : ""}`}
              onClick={() => setHighContrast((current) => !current)}
            >
              {highContrast ? "Standard contrast" : "High contrast"}
            </button>

            <button
              type="button"
              className={`toggle-button ${largeText ? "is-on" : ""}`}
              onClick={() => setLargeText((current) => !current)}
            >
              {largeText ? "Standard text" : "Large text"}
            </button>
          </div>

          <label className="field">
            <span>Speech rate</span>
            <input
              type="range"
              min="0.8"
              max="1.35"
              step="0.05"
              value={speechRate}
              onChange={(event) => setSpeechRate(Number(event.target.value))}
            />
            <strong>{speechRate.toFixed(2)}x</strong>
          </label>

          <label className="field">
            <span>Voice</span>
            <select value={selectedVoiceUri} onChange={(event) => setSelectedVoiceUri(event.target.value)}>
              <option value="">System preferred voice</option>
              {availableVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>

          <div className="note-card">
            <span className="panel-kicker">Beta positioning</span>
            <p>
              Treat WayFree as an accessibility research prototype. The interface now foregrounds
              connection state, uncertainty, and manual replay so people can test it more safely.
            </p>
          </div>
        </section>

        <section className="panel history-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">Timeline</span>
              <h2>Recent updates</h2>
            </div>
          </div>

          <div className="history-list">
            {history.length ? (
              history.map((entry) => (
                <article key={entry.id} className="history-item">
                  <div className="history-item__meta">
                    <StatusPill
                      label={entry.alertLevel}
                      tone={entry.alertLevel === "STOP" ? "stop" : entry.alertLevel === "CAUTION" ? "caution" : "clear"}
                    />
                    <span>{entry.source === "live" ? "Live analysis" : "Demo scenario"}</span>
                    <span>{formatTimestamp(entry.updatedAt)}</span>
                  </div>
                  <p>{entry.summary}</p>
                </article>
              ))
            ) : (
              <article className="history-item">
                <p>Updates will collect here once the first scene is processed.</p>
              </article>
            )}
          </div>

          <div className="note-stack">
            <article className="note-card">
              <span className="panel-kicker">Field test checklist</span>
              <p>Point the phone forward, keep the camera steady, and review STOP states before moving.</p>
            </article>
            <article className="note-card">
              <span className="panel-kicker">Open-source friendly</span>
              <p>Demo mode lets contributors review the interface without camera permissions or a backend key.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}
