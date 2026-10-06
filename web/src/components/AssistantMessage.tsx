import { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { collectMetadata } from '../lib/toolResults';
import type { AssistantMessage as Message, ToolStep } from '../types';

/** One answer: progress line, markdown body, metadata chips and the tool calls behind it. */
export function AssistantMessage({ message }: { message: Message }) {
  const html = useMemo(() => renderMarkdown(message.text), [message.text]);
  const { confidence, periods } = useMemo(() => collectMetadata(message.steps), [message.steps]);

  return (
    <article className="message assistant">
      {message.status && <p className="status-line">{message.status}</p>}
      <div
        className={message.done ? 'answer' : 'answer pending'}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="meta">
        {message.model && <span className="chip">Model: {message.model}</span>}
        {message.done && confidence && (
          <span className={`chip ${confidence}`}>Confidence: {confidence}</span>
        )}
        {message.done &&
          periods.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
      </div>
      {message.steps.length > 0 && <ToolTrace steps={message.steps} />}
      {message.error && <p className="error-banner">{message.error}</p>}
    </article>
  );
}

function ToolTrace({ steps }: { steps: ToolStep[] }) {
  return (
    <details className="trace">
      <summary>How I got this: {steps.length} tool call(s)</summary>
      <ol>
        {steps.map((step, i) => (
          <li key={i}>
            <code>
              {step.name}({JSON.stringify(step.args)})
            </code>
            <div className={step.status === 'error' ? 'error' : undefined}>{step.summary}</div>
          </li>
        ))}
      </ol>
    </details>
  );
}
