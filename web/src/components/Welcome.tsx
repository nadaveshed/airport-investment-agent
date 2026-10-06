const SUGGESTIONS = [
  'Which airports in New England are strong candidates for terminal expansion?',
  'Compare LA and Santa Ana airport congestion levels.',
  'What is the percentage of long haul flights out of Anchorage airport?',
  'What is the unmet flight demand in SFO airport and why?',
];

export function Welcome({ onPick }: { onPick: (question: string) => void }) {
  return (
    <section className="welcome">
      <h2>Find US airports where expansion is backed by demand</h2>
      <p>
        Ask about rankings, comparisons, congestion, route mix or unmet demand. Scores are computed
        deterministically from BTS, DOT and FAA public data; the AI chooses the analysis and
        explains it. Scores measure demand-driven opportunity, <strong>not</strong> profitability.
      </p>
      <div className="suggestions">
        {SUGGESTIONS.map((q) => (
          <button key={q} type="button" onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
    </section>
  );
}
