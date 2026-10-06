# Airport Investment Intelligence Agent

A conversational AI agent that helps analysts find **US airports where terminal and capacity expansion is best supported by demand**. It uses public BTS, DOT and FAA data, scores airports deterministically, and explains its reasoning.

> Ask: _"Which airports in New England are strong candidates for terminal expansion?"_, then _"Why is the second one lower?"_

![Chat UI answering the New England expansion question](docs/screenshot.png)

- **Deterministic scoring.** Composite indices are weighted KPI percentiles computed in a pure, tested domain layer. The LLM never produces numbers.
- **Explainable.** Every score comes with per-KPI percentiles, weights, contributions, confidence and caveats. The UI shows the tool calls behind each answer.
- **Conversational.** Full history, including earlier tool results, is kept per session, so follow-up questions work.
- **Chat UI with voice.** Answers stream over SSE. Voice input and spoken answers use the browser's Web Speech API.
- **Gemini or DeepSeek.** One OpenAI-compatible agent loop, with automatic fallback between providers.

See **[docs/DESIGN.md](docs/DESIGN.md)** for the scoring methodology, tradeoffs and where AI is used.

## Quick start

Requires Node 22+.

```bash
npm install
cp .env.example .env      # add GOOGLE_API_KEY (or GEMINI_API_KEY) and/or DEEPSEEK_API_KEY
npm run dev               # http://localhost:3000
```

The data snapshot is committed, so no ingest is needed. Without an API key the REST API still works and chat is disabled.

## Scripts

| Command                     | Purpose                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev` / `npm start` | Run the server (watch mode / built)                                                        |
| `npm run ingest`            | Rebuild `data/snapshot.json` from public sources (~2 min; raw files cached in `data/raw/`) |
| `npm test`                  | Unit, service, agent (scripted LLM) and API tests                                          |
| `npm run eval [-- gemini]`  | Run the brief's questions and follow-ups against the real LLM → `docs/eval-results*.md`    |
| `npm run check`             | Typecheck, lint, format check                                                              |

## API

| Method | Path                                                                     | Description                                                                                                         |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/chat`                                                              | `{ message, sessionId? }` → SSE stream: `session`, `provider`, `tool_call`, `tool_result`, `text`, `done` / `error` |
| GET    | `/api/chat/:sessionId`                                                   | Conversation history, including tool calls (for debugging and audit)                                                |
| GET    | `/api/airports?region=&states=&hubSizes=&query=`                         | Search airports                                                                                                     |
| GET    | `/api/airports/:code`                                                    | Airport profile: KPIs, traffic history, constraints                                                                 |
| GET    | `/api/airports/:code/route-mix?longHaulMiles=`                           | Long-haul share (passenger / cargo / all)                                                                           |
| GET    | `/api/airports/:code/live-status`                                        | Current FAA delay programs (cached 2 min)                                                                           |
| GET    | `/api/rankings?region=&index=&weights=passengerCagr:0.5&includeNonHubs=` | Deterministic ranking                                                                                               |
| GET    | `/api/compare?codes=LAX,SNA&index=congestion`                            | Side-by-side scores                                                                                                 |
| GET    | `/api/health`                                                            | Status, dataset info, whether chat is enabled                                                                       |

Indices: `expansionOpportunity`, `congestion`, `unmetDemand`. Errors always come back as `{ "error": { "code", "message", "details?" } }`.

## Project structure

```
src/
  server.ts, app.ts, container.ts   bootstrap, Express app, composition root
  config/        env (zod), scoring weights, regions
  routes/        one router per resource
  controllers/   HTTP only: parse request → call service → respond
  services/      use cases, shared by REST and agent tools
  domain/        pure KPI, scoring and route-mix logic
  agent/         LLM client, tools, system prompt, tool-calling loop
  repositories/  snapshot data access, in-memory sessions
  middleware/    validation, errors, logging, rate limit
  schemas/       zod schemas (REST input + LLM tool schemas)
  utils/         errors, logger, TTL cache, SSE, formatting
scripts/         ingest pipeline and LLM eval
data/            snapshot.json, airportConstraints.json (curated, sourced)
web/             chat UI
test/            domain, services, agent, api
docs/            DESIGN.md, eval results, screenshot
```
