import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantMessage } from './components/AssistantMessage';
import { Composer } from './components/Composer';
import { Header } from './components/Header';
import { Welcome } from './components/Welcome';
import { useChat } from './hooks/useChat';
import { useHealth } from './hooks/useHealth';
import { speak, stopSpeaking } from './hooks/useVoice';
import { markdownToText } from './lib/markdown';

export function App() {
  const health = useHealth();
  const [speakAnswers, setSpeakAnswers] = useState(false);
  const speakRef = useRef(speakAnswers);

  useEffect(() => {
    speakRef.current = speakAnswers;
  });

  const onAnswer = useCallback((markdown: string) => {
    if (speakRef.current) speak(markdownToText(markdown));
  }, []);
  const { messages, busy, ask, reset } = useChat(onAnswer);

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight });
  }, [messages]);

  const chatEnabled = !health || health === 'error' || health.chatEnabled;

  return (
    <>
      <Header
        health={health}
        speakAnswers={speakAnswers}
        onSpeakChange={setSpeakAnswers}
        onNewChat={() => {
          stopSpeaking();
          reset();
        }}
      />
      <main className="log" aria-live="polite">
        {messages.length === 0 && <Welcome onPick={ask} />}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="message user">
              {m.text}
            </div>
          ) : (
            <AssistantMessage key={m.id} message={m} />
          ),
        )}
      </main>
      <Composer busy={busy} canSend={chatEnabled} onSend={ask} />
    </>
  );
}
