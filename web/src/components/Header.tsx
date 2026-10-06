import type { Health } from '../types';

interface Props {
  health: Health | 'error' | null;
  speakAnswers: boolean;
  onSpeakChange: (value: boolean) => void;
  onNewChat: () => void;
}

export function Header({ health, speakAnswers, onSpeakChange, onNewChat }: Props) {
  return (
    <header className="topbar">
      <div>
        <h1>Airport Investment Agent</h1>
        <p className="subtitle">{describe(health)}</p>
      </div>
      <div className="topbar-actions">
        <label className="toggle" title="Read answers aloud">
          <input
            type="checkbox"
            checked={speakAnswers}
            onChange={(e) => onSpeakChange(e.target.checked)}
          />
          <span>Speak answers</span>
        </label>
        <button type="button" className="secondary" onClick={onNewChat}>
          New conversation
        </button>
      </div>
    </header>
  );
}

function describe(health: Props['health']): string {
  if (health === null) return 'Loading dataset…';
  if (health === 'error') return 'Dataset info unavailable';
  const period = (id: string) => health.data.sources.find((s) => s.id === id)?.period;
  const text =
    `${health.data.airports} US airports · T-100 through ${health.data.latestYear} · ` +
    `delays ${period('delays')} · fares ${period('fares')}`;
  return health.chatEnabled ? text : `${text} · Chat disabled: no LLM API key configured`;
}
