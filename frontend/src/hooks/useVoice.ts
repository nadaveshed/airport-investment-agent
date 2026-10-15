import { useCallback, useEffect, useRef, useState } from 'react';

// The Web Speech API is not in TypeScript's DOM types, so only the parts used here are declared.
interface Recognition {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
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
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const stopped = useRef(false);
  const callback = useRef(onTranscript);

  useEffect(() => {
    callback.current = onTranscript;
  });

  useEffect(
    () => () => {
      const r = recognition.current;
      if (!r) return;
      r.onstart = r.onresult = r.onerror = r.onend = null;
      r.abort();
      recognition.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    if (!RecognitionImpl) return;
    if (recognition.current) {
      stopped.current = true;
      recognition.current.stop();
      return;
    }
    setError('');
    const r = new RecognitionImpl();
    let failed = false;
    let receivedText = false;
    stopped.current = false;
    r.lang = 'en-US';
    r.interimResults = true;
    r.onstart = () => {
      setStarting(false);
      setListening(true);
    };
    r.onerror = (event) => {
      failed = true;
      setStarting(false);
      setListening(false);
      setError(voiceInputError(event.error));
    };
    r.onresult = (event) => {
      const results = Array.from(event.results);
      const text = results.map((x) => x[0].transcript).join('');
      receivedText ||= Boolean(text.trim());
      callback.current(text, results.at(-1)?.isFinal ?? false);
    };
    r.onend = () => {
      recognition.current = null;
      setStarting(false);
      setListening(false);
      if (!failed && !receivedText && !stopped.current) {
        setError('No speech was recognized. Try again in Chrome or Edge outside VS Code.');
      }
    };
    recognition.current = r;
    setStarting(true);
    try {
      r.start();
    } catch (err) {
      recognition.current = null;
      setStarting(false);
      setListening(false);
      setError(
        voiceInputError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'not-allowed'
            : 'start-failed',
        ),
      );
    }
  }, []);

  return { supported: Boolean(RecognitionImpl), listening, starting, error, toggle };
}

function voiceInputError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Voice input was blocked. Open this app in Chrome or Edge outside VS Code and allow microphone access.';
    case 'audio-capture':
      return 'Cannot access the microphone. Check your microphone and browser/Windows microphone permissions.';
    case 'network':
      return 'The browser could not reach its speech recognition service. Open this app in Chrome or Edge outside VS Code and check your connection.';
    case 'no-speech':
      return 'No speech was detected. Check your microphone and try again.';
    default:
      return `Voice input stopped (${code}). Try Chrome or Edge outside VS Code.`;
  }
}

export function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
