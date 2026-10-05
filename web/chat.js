// Chat client: streams agent turns over SSE (POST + fetch), shows the tool trace behind each
// answer, and supports voice input/output through the browser's Web Speech API.

const SESSION_KEY = 'airport-agent-session';
const CONFIDENCE_ORDER = ['low', 'medium', 'high'];

const el = {
  log: document.getElementById('log'),
  welcome: document.getElementById('welcome'),
  form: document.getElementById('composer'),
  input: document.getElementById('input'),
  send: document.getElementById('send'),
  mic: document.getElementById('mic'),
  speak: document.getElementById('speak-toggle'),
  newChat: document.getElementById('new-chat'),
  dataset: document.getElementById('dataset'),
  suggestions: document.getElementById('suggestions'),
};

const storage = {
  get() {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(id) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable: the session simply won't survive a reload */
    }
  },
};

let sessionId = storage.get();
let busy = false;

const renderMarkdown = (text) =>
  window.marked && window.DOMPurify
    ? DOMPurify.sanitize(marked.parse(text))
    : text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight });
}

/* ---------- Rendering ---------- */

function addUserMessage(text) {
  el.welcome.hidden = true;
  el.log.append(create('div', 'message user', text));
  scrollToBottom();
}

/** Creates an assistant message with its own status line, answer, metadata chips and tool trace. */
function addAssistantMessage() {
  const root = create('article', 'message assistant');
  const status = create('p', 'status-line', 'Thinking…');
  const answer = create('div', 'answer pending');
  const meta = create('div', 'meta');
  const trace = create('details', 'trace');
  const summary = create('summary', null, 'How I got this');
  const steps = create('ol');
  trace.append(summary, steps);
  trace.hidden = true;
  root.append(status, answer, meta, trace);
  el.log.append(root);
  scrollToBottom();

  let raw = '';
  let renderQueued = false;
  const confidences = [];
  const periods = new Set();
  const stepById = new Map();

  return {
    setStatus(text) {
      status.textContent = text;
      status.hidden = !text;
    },
    appendText(delta) {
      raw += delta;
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        answer.innerHTML = renderMarkdown(raw);
        scrollToBottom();
      });
    },
    addChip(text, className = '') {
      meta.append(create('span', `chip ${className}`.trim(), text));
    },
    toolCall(id, name, args) {
      trace.hidden = false;
      const li = create('li');
      li.append(create('code', null, `${name}(${JSON.stringify(args)})`));
      li.append(create('div', null, 'running…'));
      steps.append(li);
      stepById.set(id, li);
      summary.textContent = `How I got this: ${steps.children.length} tool call(s)`;
    },
    toolResult(id, ok, result) {
      const line = stepById.get(id)?.lastChild;
      if (line) {
        line.textContent = ok ? summarizeResult(result) : `Error: ${result.error}`;
        line.className = ok ? '' : 'error';
      }
      if (ok) collectMetadata(result, confidences, periods);
    },
    finish() {
      answer.classList.remove('pending');
      answer.innerHTML = renderMarkdown(raw);
      this.setStatus('');
      if (confidences.length) {
        const lowest = confidences.sort(
          (a, b) => CONFIDENCE_ORDER.indexOf(a) - CONFIDENCE_ORDER.indexOf(b),
        )[0];
        this.addChip(`Confidence: ${lowest}`, lowest);
      }
      for (const p of periods) this.addChip(p);
      return answer.textContent;
    },
    fail(message) {
      answer.classList.remove('pending');
      this.setStatus('');
      root.append(create('p', 'error-banner', message));
    },
  };
}

/** One-line, human-readable summary of a tool result for the trace panel. */
function summarizeResult(result) {
  if (Array.isArray(result.results)) {
    return result.results
      .map((r) => `${r.rank ?? ''}${r.rank ? '. ' : ''}${r.code} ${r.score} (${r.confidence})`)
      .join(' · ');
  }
  if (result.mix) {
    const { passenger, cargo } = result.mix;
    return `${result.definition}: passenger ${passenger.longHaulSharePct ?? 'n/a'}%, cargo ${cargo.longHaulSharePct ?? 'n/a'}%`;
  }
  if (result.airport && result.kpis) return `Profile of ${result.airport.name}`;
  if (Array.isArray(result.airports)) return `${result.total} airport(s) found`;
  if (result.summary) return `${result.summary}${result.stale ? ' (stale)' : ''}`;
  return 'done';
}

function collectMetadata(result, confidences, periods) {
  for (const r of result.results ?? []) if (r.confidence) confidences.push(r.confidence);
  if (result.dataPeriods) {
    const { traffic, delays, fares } = result.dataPeriods;
    periods.add(`Traffic ${traffic}`);
    if (delays) periods.add(`Delays ${delays}`);
    if (fares) periods.add(`Fares ${fares}`);
  }
  if (result.year && result.mix) periods.add(`Routes ${result.year}`);
  if (result.fetchedAt) periods.add(`Live FAA ${new Date(result.fetchedAt).toLocaleTimeString()}`);
}

/* ---------- Networking ---------- */

/** Reads a fetch() body as Server-Sent Events and calls onEvent(name, data) per event. */
async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = frame.match(/^event: (.*)$/m)?.[1];
      const data = frame.match(/^data: (.*)$/m)?.[1];
      if (event && data) onEvent(event, JSON.parse(data));
    }
  }
}

async function ask(message) {
  if (busy || !message.trim()) return;
  setBusy(true);
  addUserMessage(message);
  const view = addAssistantMessage();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sessionId ? { sessionId, message } : { message }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error?.message ?? `Request failed (${response.status})`);
    }

    let finalText = '';
    await readSse(response, (event, data) => {
      switch (event) {
        case 'session':
          sessionId = data.sessionId;
          storage.set(sessionId);
          break;
        case 'provider':
          view.addChip(`Model: ${data.model}`);
          break;
        case 'tool_call':
          view.setStatus(`Running ${data.name}…`);
          view.toolCall(data.id, data.name, data.args);
          break;
        case 'tool_result':
          view.toolResult(data.id, data.ok, data.result);
          view.setStatus('Writing answer…');
          break;
        case 'text':
          view.appendText(data.delta);
          break;
        case 'done':
          finalText = view.finish();
          break;
        case 'error':
          view.fail(data.message);
          break;
      }
    });
    if (finalText) speak(finalText);
  } catch (err) {
    view.fail(err.message);
  } finally {
    setBusy(false);
  }
}

function setBusy(value) {
  busy = value;
  el.send.disabled = value;
  el.input.disabled = value;
  if (!value) el.input.focus();
}

/** Restores the visible conversation after a page reload (tool messages are not re-rendered). */
async function restoreSession() {
  if (!sessionId) return;
  const response = await fetch(`/api/chat/${sessionId}`).catch(() => null);
  if (!response?.ok) {
    sessionId = null;
    storage.set(null);
    return;
  }
  const session = await response.json();
  for (const m of session.messages) {
    if (m.role === 'user') addUserMessage(m.content);
    else if (m.role === 'assistant' && m.content) {
      const view = addAssistantMessage();
      view.appendText(m.content);
      view.finish();
    }
  }
}

async function loadDataset() {
  try {
    const health = await (await fetch('/api/health')).json();
    const period = (id) => health.data.sources.find((s) => s.id === id)?.period;
    el.dataset.textContent =
      `${health.data.airports} US airports · T-100 through ${health.data.latestYear} · ` +
      `delays ${period('delays')} · fares ${period('fares')}`;
    if (!health.chatEnabled) {
      el.dataset.textContent += ' · Chat disabled: no LLM API key configured';
      el.send.disabled = true;
    }
  } catch {
    el.dataset.textContent = 'Dataset info unavailable';
  }
}

/* ---------- Voice ---------- */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupVoiceInput() {
  if (!Recognition) return;
  el.mic.hidden = false;
  let listening = false;
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const transcript = [...event.results].map((r) => r[0].transcript).join('');
    el.input.value = transcript;
    if (event.results[event.results.length - 1].isFinal) ask(transcript).then(clearInput);
  };
  recognition.onend = () => {
    listening = false;
    el.mic.classList.remove('listening');
  };
  el.mic.addEventListener('click', () => {
    if (listening) return recognition.stop();
    listening = true;
    el.mic.classList.add('listening');
    recognition.start();
  });
}

function speak(text) {
  if (!el.speak.checked || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/* ---------- Wiring ---------- */

function clearInput() {
  el.input.value = '';
  el.input.style.height = 'auto';
}

el.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = el.input.value;
  clearInput();
  ask(message);
});

el.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    el.form.requestSubmit();
  }
});

el.input.addEventListener('input', () => {
  el.input.style.height = 'auto';
  el.input.style.height = `${el.input.scrollHeight}px`;
});

el.suggestions.addEventListener('click', (event) => {
  if (event.target instanceof HTMLButtonElement) {
    ask(event.target.textContent.replace(/\s+/g, ' ').trim());
  }
});

el.newChat.addEventListener('click', () => {
  sessionId = null;
  storage.set(null);
  window.speechSynthesis?.cancel();
  el.log.querySelectorAll('.message').forEach((m) => m.remove());
  el.welcome.hidden = false;
});

setupVoiceInput();
loadDataset();
restoreSession();
