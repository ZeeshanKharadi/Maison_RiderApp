import { Platform } from 'react-native';
import Tts from 'react-native-tts';

/** Cap stalled native init so the speak queue cannot hang forever. */
const TTS_INIT_TIMEOUT_MS = 8_000;

let initPromise: Promise<boolean> | null = null;
let initOk = false;

/** Monotonic ownership for stop/speak; newer tokens discard older work. */
let nextRequestToken = 0;
let currentOwnerToken = 0;
let opChain: Promise<void> = Promise.resolve();

function enqueueOp(op: () => Promise<void>): void {
  opChain = opChain.then(op, op);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('tts_init_timeout'));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function tryEnglishLanguage(): Promise<boolean> {
  for (const lang of ['en-US', 'en-GB', 'en']) {
    try {
      await Tts.setDefaultLanguage(lang);
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}

async function tryEnglishVoice(): Promise<boolean> {
  try {
    const voices = await Tts.voices();
    const en = voices.find(
      v =>
        !v.notInstalled &&
        typeof v.language === 'string' &&
        v.language.toLowerCase().startsWith('en'),
    );
    if (!en) return false;
    await Tts.setDefaultVoice(en.id);
    return true;
  } catch {
    return false;
  }
}

/** Device TTS init; does not install engines or download voice packs. */
export async function ensureNavigationTtsReady(): Promise<boolean> {
  if (initOk) return true;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await withTimeout(
          Promise.resolve(Tts.getInitStatus()),
          TTS_INIT_TIMEOUT_MS,
        );
        if (await tryEnglishLanguage()) {
          initOk = true;
          return true;
        }
        if (await tryEnglishVoice()) {
          initOk = true;
          return true;
        }
        return false;
      } catch {
        return false;
      }
    })().then(ok => {
      if (!ok) {
        // Allow a later speak attempt to retry; do not leave a hung promise.
        initPromise = null;
      }
      return ok;
    });
  }
  return initPromise;
}

/**
 * Invalidate pending/current speech. Returns the new owner token so callers
 * can detect obsolescence after async work.
 */
export function discardNavigationSpeech(): number {
  const token = ++nextRequestToken;
  currentOwnerToken = token;
  enqueueOp(async () => {
    if (token !== currentOwnerToken) return;
    try {
      await Tts.stop();
    } catch {
      /* visual nav continues */
    }
  });
  return token;
}

/**
 * Speak with a new ownership token. Serialized after stop; delayed advance
 * cannot replace a newer near warning that already took ownership.
 */
export function speakNavigationTts(text: string): number {
  const token = ++nextRequestToken;
  currentOwnerToken = token;
  enqueueOp(async () => {
    if (token !== currentOwnerToken) return;
    if (!(await ensureNavigationTtsReady())) return;
    if (token !== currentOwnerToken) return;
    try {
      if (Platform.OS === 'ios') {
        await Tts.setIgnoreSilentSwitch('ignore');
      }
      if (token !== currentOwnerToken) return;
      await Tts.setDucking(true);
      if (token !== currentOwnerToken) return;
      await Tts.stop();
      if (token !== currentOwnerToken) return;
      Tts.speak(text);
    } catch {
      /* ignore — map guidance stays */
    }
  });
  return token;
}

/** Release navigation-owned speech on screen exit. */
export function releaseNavigationTts(): void {
  discardNavigationSpeech();
}
