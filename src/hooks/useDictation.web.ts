import { useEffect, useRef, useState } from 'react';

import type { DictationHandler } from './useDictation';

type SpeechRecognitionLike = {
  new (): {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: {
      results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
    }) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    start: () => void;
    stop: () => void;
  };
};

function getRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionLike;
    webkitSpeechRecognition?: SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Web dictation via the Web Speech API (Chrome and friends; hidden elsewhere). */
export function useDictation(onTranscript: DictationHandler) {
  const [listening, setListening] = useState(false);
  const handlerRef = useRef(onTranscript);
  handlerRef.current = onTranscript;
  const recognitionRef = useRef<InstanceType<SpeechRecognitionLike> | null>(null);
  const Recognizer = getRecognizer();

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  function start() {
    if (!Recognizer) return;
    const recognition = new Recognizer();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      const results = Array.from(event.results as ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>);
      const transcript = results.map((r) => r[0].transcript).join('');
      const isFinal = results.length > 0 && results[results.length - 1].isFinal;
      handlerRef.current(transcript, isFinal);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stop() {
    recognitionRef.current?.stop();
  }

  return { available: Recognizer !== null, listening, start, stop };
}
