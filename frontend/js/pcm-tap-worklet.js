// PCM tap for the live Squeezebox cast.
//
// Sits on the Harmonizer player's master mix as a side-tap (its output is muted
// downstream), reads the exact audio the user hears, converts to interleaved
// Int16 (s16le), and posts ~1024-frame batches to the main thread, which relays
// them over a WebSocket to the cast relay. No processing -- a faithful mirror.
class PcmTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._frames = 1024;            // ~21ms @ 48k per batch
    this._buf = new Int16Array(this._frames * 2);
    this._i = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const L = input[0];
      const R = input.length > 1 ? input[1] : input[0];
      if (L) {
        for (let n = 0; n < L.length; n++) {
          let l = L[n], r = R[n];
          l = l < -1 ? -1 : l > 1 ? 1 : l;
          r = r < -1 ? -1 : r > 1 ? 1 : r;
          this._buf[this._i++] = l < 0 ? l * 32768 : l * 32767;
          this._buf[this._i++] = r < 0 ? r * 32768 : r * 32767;
          if (this._i >= this._buf.length) {
            this.port.postMessage(this._buf.slice());
            this._i = 0;
          }
        }
      }
    }
    return true; // keep the processor alive
  }
}
registerProcessor('pcm-tap', PcmTapProcessor);
