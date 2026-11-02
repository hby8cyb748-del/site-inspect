// On-phone transcription. Callers unload the model after each note because iPhones limit web app memory.
const SAMPLE_RATE = 16000; // what Whisper expects
const MIN_TIME_LIMIT_S = 180;
const TIME_LIMIT_PER_AUDIO_S = 15; // an iPhone can kill the worker silently, so don't wait forever

export const MODELS = {
  'Xenova/whisper-base.en': 'Standard (about 80 MB, more accurate)',
  'Xenova/whisper-tiny.en': 'Small (about 40 MB, faster)',
};
export const DEFAULT_MODEL = 'Xenova/whisper-base.en';

let worker = null;
let nextId = 0;
const pending = new Map();
const downloads = new Map();
let onDownload = null;

function start() {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'download') {
      downloads.set(data.file, data);
      const files = [...downloads.values()];
      const total = files.reduce((n, f) => n + f.total, 0);
      onDownload?.(total ? Math.round((files.reduce((n, f) => n + f.loaded, 0) / total) * 100) : 0);
      return;
    }
    const job = pending.get(data.id);
    pending.delete(data.id);
    if (data.type === 'error') job?.reject(new Error(data.message));
    else job?.resolve(data.text);
  };
  worker.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || 'Transcription stopped unexpectedly.'));
    pending.clear();
    releaseWhisper();
  };
  return worker;
}

function send(message, transfer) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    start().postMessage({ ...message, id }, transfer ?? []);
  });
}

export function releaseWhisper() {
  worker?.terminate();
  worker = null;
  pending.clear();
  onDownload = null;
  downloads.clear();
}

export function loadWhisper(model, progress) {
  onDownload = progress;
  return send({ type: 'load', model });
}

async function decode(blob) {
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const audio = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < audio.length; i++) audio[i] += channel[i] / buffer.numberOfChannels;
  }
  return audio;
}

export async function transcribeOnPhone(blob, model) {
  const audio = await decode(blob);
  const seconds = audio.length / SAMPLE_RATE;
  const limit = Math.max(MIN_TIME_LIMIT_S, seconds * TIME_LIMIT_PER_AUDIO_S) * 1000;
  let timer;
  try {
    return await Promise.race([
      send({ type: 'transcribe', model, audio }, [audio.buffer]),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Transcription stopped responding.')), limit);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
