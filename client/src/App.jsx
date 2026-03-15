import { useEffect, useRef, useState } from "react"
import { io } from "socket.io-client"

const socket = io("http://localhost:8000")

export default function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [description, setDescription] = useState("Starting camera...")
  const [connected, setConnected] = useState(false)
  const [alertLevel, setAlertLevel] = useState("CLEAR")

  useEffect(() => {
    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))
    socket.on("description", (data) => {
      setDescription(data.text)
      if (data.text.includes("STOP")) setAlertLevel("STOP")
      else if (data.text.includes("CAUTION")) setAlertLevel("CAUTION")
      else setAlertLevel("CLEAR")
    })

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("description")
    }
  }, [])

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch((err) => setDescription("Camera access denied: " + err.message))
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!canvasRef.current || !videoRef.current || !connected) return
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      canvas.width = 640
      canvas.height = 480
      ctx.drawImage(videoRef.current, 0, 0, 640, 480)
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1]
      socket.emit("frame", { image: base64 })
    }, 1500)

    return () => clearInterval(interval)
  }, [connected])

  const alertColor = {
    CLEAR: "#22c55e",
    CAUTION: "#f59e0b",
    STOP: "#ef4444"
  }[alertLevel]

  return (
    <div style={{ fontFamily: "monospace", padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Wayfree</h1>
      <p style={{ color: connected ? "#22c55e" : "#ef4444", marginBottom: "16px" }}>
        {connected ? "Connected" : "Disconnected"}
      </p>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", borderRadius: "8px", marginBottom: "16px" }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div style={{
        background: "#111",
        borderLeft: `4px solid ${alertColor}`,
        padding: "16px",
        borderRadius: "4px",
        whiteSpace: "pre-wrap",
        lineHeight: "1.8"
      }}>
        <span style={{ color: alertColor, fontWeight: "bold", display: "block", marginBottom: "8px" }}>
          {alertLevel}
        </span>
        <span style={{ color: "#e5e5e5", fontSize: "14px" }}>{description}</span>
      </div>
    </div>
  )
}