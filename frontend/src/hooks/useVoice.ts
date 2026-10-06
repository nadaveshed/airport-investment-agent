import { useCallback, useEffect, useRef, useState } from 'react';

// The Web Speech API is not in TypeScript's DOM types, so only the parts used here are declared.
interface Recognition {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  onend: (() => void) | null;
}

const speechWindow = window as unknown as {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
const RecognitionImpl = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

/** Voice input. Calls onTranscript with interim text while listening and final=true at the end. */
export function useVoiceInput(onTranscript: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onTranscript);

  useEffect(() => {
    callback.current = onTranscript;
  });

  const toggle = useCallback(() => {
    if (!RecognitionImpl) return;
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const r = new RecognitionImpl();
    r.lang = 'en-US';
    r.interimResults = true;
    r.onresult = (event) => {
      const results = Array.from(event.results);
      const text = results.map((x) => x[0].transcript).join('');
      callback.current(text, results.at(-1)?.isFinal ?? false);
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = r;
    setListening(true);
    r.start();
  }, []);

  return { supported: Boolean(RecognitionImpl), listening, toggle };
}

export function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
