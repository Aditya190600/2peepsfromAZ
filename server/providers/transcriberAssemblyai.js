// Default transcriber slot: wraps the existing AssemblyAI pre-recorded STT
// pipeline unchanged. See server/checks/transcribeUpload.js.
import { transcribeUpload } from "../checks/transcribeUpload.js";
import { getCredential } from "./store.js";

export async function transcribe(buffer) {
  const apiKey = getCredential("assemblyai")?.apiKey ?? process.env.ASSEMBLYAI_API_KEY;
  return transcribeUpload(buffer, apiKey);
}
