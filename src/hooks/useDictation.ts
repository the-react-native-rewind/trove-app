import { useEffect, useRef, useState } from 'react';

export type DictationHandler = (sessionTranscript: string, isFinal: boolean) => void;

// Loaded lazily so the app still runs on a dev build that predates the native
// module (the mic button simply doesn't show until the next native build).
let speech: typeof import('expo-speech-recognition') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speech = require('expo-speech-recognition');
  if (!speech?.ExpoSpeechRecognitionModule) speech = null;
} catch {
  speech = null;
}

/**
 * Native dictation via the OS speech recognizer (on-device, streams partials).
 * The handler receives the transcript of the current dictation session; append
 * it to whatever text existed before the session started.
 */
export function useDictation(onTranscript: DictationHandler) {
  const [listening, setListening] = useState(false);
  const handlerRef = useRef(onTranscript);
  handlerRef.current = onTranscript;

  useEffect(() => {
    if (!speech) return;
    const { ExpoSpeechRecognitionModule } = speech;
    const subs = [
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const transcript = event.results?.[0]?.transcript ?? '';
        handlerRef.current(transcript, !!event.isFinal);
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => setListening(false)),
      ExpoSpeechRecognitionModule.addListener('error', () => setListening(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  async function start() {
    if (!speech) return;
    const permission = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) return;
    speech.ExpoSpeechRecognitionModule.start({
      interimResults: true,
      continuous: true,
    });
    setListening(true);
  }

  function stop() {
    speech?.ExpoSpeechRecognitionModule.stop();
  }

  return { available: speech !== null, listening, start, stop };
}
