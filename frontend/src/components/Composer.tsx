import { useEffect, useRef, useState } from 'react';
import { useVoiceInput } from '../hooks/useVoice';

interface Props {
  busy: boolean;
  canSend: boolean;
  onSend: (text: string) => void;
}

export function Composer({ busy, canSend, onSend }: Props) {
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceInput((transcript, final) => {
    if (!final) return setText(transcript);
    setText('');
    onSend(transcript);
  });

  // Grow the textarea with its content.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);

  const submit = () => {
    if (busy || !canSend || !text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {voice.supported && (
        <button
          type="button"
          className={voice.listening ? 'icon-button listening' : 'icon-button'}
          title="Speak your question"
          aria-label="Speak your question"
          onClick={voice.toggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
          </svg>
        </button>
      )}
      <textarea
        ref={input}
        rows={1}
        maxLength={2000}
        placeholder="Ask about US airports…"
        required
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" disabled={busy || !canSend}>
        Send
      </button>
    </form>
  );
}
