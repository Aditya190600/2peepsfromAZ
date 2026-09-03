import { useVoiceAgent } from "./useVoiceAgent";

export default function App() {
  const { status, transcript, connect, disconnect } = useVoiceAgent();

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>ComplyLine Voice</h1>
      <p>California CCPA / CPRA compliance advisor - talk to it about consumer privacy rights.</p>

      <button onClick={status === "idle" || status === "error" ? connect : disconnect}>
        {status === "idle" || status === "error" ? "Start" : "Stop"}
      </button>
      <span style={{ marginLeft: 12 }}>status: {status}</span>

      <ul style={{ marginTop: 24 }}>
        {transcript.map((t, i) => (
          <li key={i}>
            <strong>{t.role}:</strong> {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
