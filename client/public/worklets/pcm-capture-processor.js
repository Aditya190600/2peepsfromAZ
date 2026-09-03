// Runs on the audio render thread. Buffers mic samples and posts ~50ms (1200-sample)
// Float32 chunks to the main thread, which converts to PCM16 and base64-encodes.
// MediaRecorder can't emit raw PCM16, which is why this worklet exists.
const CHUNK_SAMPLES = 1200; // 50ms at 24kHz mono

class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_SAMPLES);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === CHUNK_SAMPLES) {
        this.port.postMessage(this.buffer.slice(0));
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
