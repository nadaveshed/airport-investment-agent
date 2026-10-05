# Implementation Plan — Airport Investment Intelligence Agent

## 1. Guiding principle

**The LLM never computes numbers.** Every metric, score and ranking comes from a deterministic, unit-tested domain layer. The LLM acts as a _planner_ (natural language → tool calls) and a _narrator_ (tool results → explanation).

**Scope statement:** the brief asks where renovations will be _most profitable_. We have no public cost/ROI data, so the score measures **demand-driven expansion opportunity**, not profitability. This is stated in the docs, the system prompt and the UI.

## 2. Architecture

```
Web chat (SSE, voice) ─▶ routes ─▶ middleware (zod) ─▶ controllers ─▶ services ─▶ domain (pure)
                                                                         │      └▶ repositories
Agent tools ─────────────────────────────────────────────────────────────┘
```

- Dependency direction: `api → services → domain`, `services → repositories`. Domain has no I/O.
- Controllers and agent tools share the same services — one source of truth; everything the agent knows is also inspectable via REST.

## 3. Stack

| Concern                   | Choice                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Runtime                   | Node 22+, TypeScript, `tsx`                                                                                          |
| HTTP                      | Express 5 (native async error propagation)                                                                           |
| Validation / tool schemas | `zod` v4 (`z.toJSONSchema`) — single source for types, validation and LLM tool schemas                               |
| LLM                       | `openai` SDK against OpenAI-compatible endpoints: **Gemini** (default) and **DeepSeek** (fallback), switched via env |
| CSV ingest                | `csv-parse` (streaming)                                                                                              |
| Tests                     | `node:test`                                                                                                          |
| Quality                   | ESLint, Prettier, `tsc --noEmit` → `npm run check`                                                                   |
| CI                        | GitHub Actions: `check` + `test`                                                                                     |
| Frontend                  | Static HTML/JS served by Express, Web Speech API for voice                                                           |

No DB, no queue, no Redis — see §11.

## 4. Data sources

| Source                         | Data                                                                   | Used for                                     | Access                                             |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| BTS T-100 Segment              | passengers, seats, departures, distance per route/month                | demand, load factor, growth, long-haul share | ingest → snapshot                                  |
| BTS On-Time Performance        | delays, cancellations, taxi-out                                        | congestion                                   | ingest → snapshot                                  |
| DOT Consumer Airfare (Socrata) | avg fare per city-pair                                                 | fare premium                                 | ingest                                             |
| FAA CY Enplanements            | annual boardings, 5 years                                              | scale, CAGR                                  | ingest                                             |
| OurAirports                    | code, name, state, coordinates                                         | geography / regions                          | ingest                                             |
| FAA NAS Status API             | live delays / ground stops                                             | live congestion context                      | live, TTL-cached                                   |
| `airportConstraints.json`      | curated known constraints (e.g. SNA passenger cap, SFO runway spacing) | "why" explanations                           | manual, each row has `sourceUrl` + `curated: true` |

**Risk #1 is data access** → day-one spike. Fallback: pre-downloaded BTS CSVs in `data/raw/` with reproduction instructions.

## 5. Scoring methodology

### Expansion Opportunity Score (EOS, 0–100)

Weighted sum of KPIs, each normalized to a **percentile within the FAA hub-size cohort** (Large / Medium / Small).

| KPI                                   | Signal                             | Weight |
| ------------------------------------- | ---------------------------------- | ------ |
| `demandGrowth` — 5y passenger CAGR    | demand is rising                   | 30%    |
| `capacityPressure` — load factor      | planes are full                    | 25%    |
| `congestion` — delay % + avg taxi-out | infrastructure saturated           | 20%    |
| `scale` — log(enplanements)           | size of investment upside          | 15%    |
| `farePremium` — avg fare vs national  | pricing power / unmet demand proxy | 10%    |

Weights live in `config/scoring.config.ts`; `rank_airports` accepts overrides (still deterministic).

### Supporting metrics

- **Congestion Index** — for comparisons (LAX vs SNA).
- **Long-haul share** — % of departures/seats on routes > 3,000 mi (parameter, stated as assumption). Passenger vs cargo separated (ANC).
- **Unmet Demand Proxy** — load factor + fare premium + congestion, plus curated constraints for the "why". Explicitly labelled a _proxy_.

### Result shape

```ts
interface ScoreResult {
  airport: string;
  total: number;
  components: { kpi; raw; percentile; weight; contribution; source; period }[];
  confidence: 'high' | 'medium' | 'low'; // data completeness & freshness
  caveats: string[];
}
```

## 6. Agent

- **Tools** (zod-defined): `find_airports`, `get_airport_profile`, `rank_airports`, `compare_airports`, `get_route_mix`, `get_live_status`.
- **System prompt rules:** cite source + period; state assumptions and confidence; never invent numbers; restate how a follow-up reference was resolved ("'the second one' = BDL from the previous ranking"); decline out-of-scope (non-US).
- **Loop safeguards:** max 6 tool rounds per turn, timeout via `AbortController`, abort when client disconnects, one retry on the other provider on 429/5xx. Tool errors are returned to the LLM as tool results, not thrown.

### Conversation memory

- Client sends `{ sessionId, message }`; server keeps the **full history including tool calls and tool results**, sent to the LLM every turn.
- Old tool results are truncated beyond N turns to bound context.
- Session ID created by server, stored in `localStorage`; "New conversation" button resets it. Idle sessions evicted via TTL.
- Verifiability: tool-call trace panel under every answer in the UI; `GET /api/chat/:sessionId` for debugging; multi-turn tests.

## 7. Caching

| What                      | How                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Snapshot data             | loaded once at startup (repository = cache)                                            |
| Cohort KPIs / percentiles | precomputed at startup; custom-weight rankings memoized by `hash(filter+weights)`      |
| FAA live status           | TTL 2 min per airport; serve stale with `stale: true` on upstream failure              |
| LLM responses             | **not cached** (context-dependent); provider-side prompt caching applies automatically |

Implemented by `utils/ttlCache.ts` (~30 lines), also used for session eviction.

## 8. Project structure

```
airport-investment-agent/
├─ src/
│  ├─ server.ts                  bootstrap: env, load snapshot, listen
│  ├─ app.ts                     express app: middleware, routes, static web/
│  ├─ config/                    env.ts (zod), scoring.config.ts, regions.ts
│  ├─ routes/                    index.ts, chat.routes.ts, airports.routes.ts,
│  │                             rankings.routes.ts, health.routes.ts
│  ├─ controllers/               chat.controller.ts, airports.controller.ts, rankings.controller.ts
│  ├─ services/                  airport.service.ts, scoring.service.ts, routeMix.service.ts,
│  │                             liveStatus.service.ts, chat.service.ts
│  ├─ domain/                    kpis.ts, normalize.ts, scoring.ts, routeMix.ts   (pure)
│  ├─ agent/                     llm.ts, tools.ts, prompt.ts, agent.ts
│  ├─ repositories/              airport.repository.ts (interface), jsonSnapshot.repository.ts,
│  │                             session.repository.ts
│  ├─ middleware/                validate.ts, errorHandler.ts, notFound.ts, requestLogger.ts, rateLimit.ts
│  ├─ schemas/                   chat.schema.ts, airport.schema.ts   (request DTOs + tool inputs)
│  ├─ types/                     AirportMetrics, RouteSegment, ScoreResult
│  └─ utils/                     errors.ts, logger.ts, math.ts, sse.ts, ttlCache.ts
├─ scripts/                      ingest.ts, eval.ts, sources/*
├─ data/                         raw/, snapshot.json, airportConstraints.json
├─ web/                          index.html, chat.js, styles.css
├─ test/                         domain/, services/, agent/ (incl. conversation.test.ts)
├─ docs/                         PLAN.md, DESIGN.md, eval-results.md
├─ .github/workflows/ci.yml
├─ .env.example, eslint.config.js, .prettierrc, package.json, tsconfig.json, README.md
```

## 9. API

| Method | Path                                              | Purpose                                     |
| ------ | ------------------------------------------------- | ------------------------------------------- |
| POST   | `/api/chat`                                       | agent turn, SSE stream, returns `sessionId` |
| GET    | `/api/chat/:sessionId`                            | conversation history (debug)                |
| GET    | `/api/airports?region=&state=&hubSize=`           | search                                      |
| GET    | `/api/airports/:code`                             | profile + KPIs                              |
| GET    | `/api/rankings?region=&weights=`                  | deterministic ranking                       |
| GET    | `/api/compare?codes=LAX,SNA&dimension=congestion` | comparison                                  |
| GET    | `/api/health`                                     | liveness                                    |

**Errors:** uniform `{ error: { code, message, details? } }`. `AppError` subclasses → own status, `ZodError` → 400, unknown → 500 without stack.
**Protection:** `express-rate-limit` on `/api/chat`, message length limit in zod, keys only in `.env`.

## 10. Quality & deliverables

- **Unit tests** for domain (KPIs, normalization, scoring).
- **Agent scenario tests** for the 4 brief questions (mocked LLM → asserts correct tool + params).
- **Multi-turn tests**, e.g. "Rank New England" → "Why is the second one lower?" → expects `get_airport_profile({code:"BDL"})`.
- **`npm run eval`** runs the 4 questions against the real agent → `docs/eval-results.md`, including a Gemini vs DeepSeek comparison.
- **UI transparency:** confidence badge, data period, collapsible tool trace per answer.
- **README:** 3-command setup, screenshot/GIF.
- **Small, logical commits** per phase.

## 11. Deliberately not built (documented in DESIGN.md)

| Not built           | Why / when it would be                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Database            | read-only, small, in-memory data; add Postgres behind the repository interface for scheduled ingest or flight-level data |
| Queue               | no background jobs; chat is streamed synchronously; add for scheduled ingest or heavy batch reports                      |
| Redis               | single instance; needed for shared sessions/cache across instances                                                       |
| Auth / multi-user   | out of scope for a demo; required in production (audit trail for investment decisions)                                   |
| ML scoring          | no profitability labels to train on; weighted percentiles are transparent and explainable                                |
| Profitability / ROI | no public construction-cost or airport-financial data                                                                    |

## 12. Timeline (~24h)

| Phase                                                     | Time |
| --------------------------------------------------------- | ---- |
| Spike: data sources + LLM tool calling (Gemini, DeepSeek) | 4h   |
| Scaffold (server, middleware, utils, lint, CI)            | 1h   |
| Ingest + snapshot                                         | 2h   |
| Domain + tests                                            | 3h   |
| Services, controllers, routes                             | 2h   |
| Agent (tools, prompt, loop, memory) + tests               | 4h   |
| Web chat UI + voice                                       | 3h   |
| Eval, polish                                              | 2h   |
| DESIGN.md, README                                         | 2h   |
| Buffer                                                    | 1h   |
