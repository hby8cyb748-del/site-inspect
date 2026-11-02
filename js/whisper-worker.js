// Runs Whisper in the background so the screen stays responsive. Audio never leaves this phone.
// The only network use is the one-time model download from Hugging Face.
import { pipeline, env } from '../vendor/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // GitHub Pages can't enable multi-threaded WebAssembly
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../vendor/ort-wasm-simd-threaded.mjs', import.meta.url).href,
  wasm: new URL('../vendor/ort-wasm-simd-threaded.wasm', import.meta.url).href,
};

let loaded = null;

function load(model) {
  if (loaded?.model === model) return loaded.pipe;
  const pipe = pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress') postMessage({ type: 'download', file: p.file, loaded: p.loaded, total: p.total });
    },
  });
  loaded = { model, pipe };
  return pipe;
}

onmessage = async ({ data }) => {
  try {
    const transcriber = await load(data.model);
    if (data.type === 'load') return postMessage({ type: 'done', id: data.id });
    const result = await transcriber(data.audio, { chunk_length_s: 30, stride_length_s: 5 });
    postMessage({ type: 'done', id: data.id, text: result.text.trim() });
  } catch (err) {
    loaded = null;
    postMessage({ type: 'error', id: data.id, message: err.message });
  }
};
