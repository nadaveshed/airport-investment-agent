# Design: Airport Investment Intelligence Agent

## 1. Problem and scope

Analysts want to know which US airports are the strongest candidates for terminal and capacity investment, and why. The agent answers in conversation: rankings, comparisons, congestion, route mix and unmet demand, with follow-up questions.

**What "opportunity" means here.** The brief asks where renovations will be _most profitable_. No public data covers construction costs, airport finances or returns, so the agent measures the **demand-driven case for expansion**: growing traffic, full planes, saturated infrastructure, scale and pricing power. This is a necessary condition for profitable expansion, not a profitability forecast. The agent states this distinction whenever it matters.

**Coverage.** US airports with more than 10,000 annual enplanements (FAA "primary airports", 396 in the snapshot), passenger and cargo flights, with history back to 2019.

## 2. Architecture

```
 Browser (chat UI, voice)
     │  POST /api/chat → Server-Sent Events (text, tool calls, tool results)
     ▼
 routes → middleware (zod validation, rate limit) → controllers
     │
     ├── ChatService ── Agent (LLM tool-calling loop) ── ToolRegistry ──┐
     │                                                                  │
     └── REST controllers ──────────────────────────────────────────────┤
                                                                        ▼
                              services (Airport, Scoring, RouteMix, LiveStatus)
                                     │                      │
                       domain (pure: KPIs, scoring, route mix)   repositories (snapshot, sessions)
                                                                        │
                       scripts/ingest.ts ── public sources ──▶ data/snapshot.json
```

Design decisions:

- **The LLM never computes numbers.** Every figure comes from the domain layer, which is pure and unit-tested. The LLM plans (picks tools and arguments) and narrates (explains the results).
- **Agent tools and REST endpoints call the same services.** Anything the agent says can be reproduced with `GET /api/rankings`, `/api/compare` and similar, which helps debugging and auditing.
- **Single sources of truth.** Index weights live in `config/scoring.config.ts`. The system prompt's methodology section is _generated_ from that config, so the explanation cannot drift from the code. The zod schemas validate REST input and tool arguments, and they also produce the JSON Schema the LLM sees.
- **Composition root** (`container.ts`) wires concrete implementations. Tests swap in a scripted LLM, a fake FAA feed or another repository.

## 3. Data

| Source                                                    | Used for                                                                              | Access                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| BTS T-100 Segment, all carriers (2019, 2023–2025)         | enplanements, seats, load factor, growth, route distances, cargo vs passenger         | TranStats form, replayed by script     |
| BTS Airline Delay Causes (latest 12 months)               | delay rate, NAS (capacity) delays, cancellations                                      | TranStats download                     |
| DOT Consumer Airfare Report, Table 1a (latest 4 quarters) | average fare, distance-adjusted fare index                                            | Socrata API                            |
| OurAirports                                               | names, cities, states, coordinates                                                    | CSV                                    |
| FAA NAS Status                                            | live ground stops and delay programs (context only)                                   | live API, 2-minute cache               |
| `data/airportConstraints.json`                            | curated structural constraints (slots, caps, runway geometry), each with a source URL | hand-curated, **never used in scores** |

**Snapshot, not live calls.** `npm run ingest` downloads, aggregates and writes `data/snapshot.json` (about 6 MB, committed, so the app runs without the ingest). BTS data lags 3–6 months anyway, and a snapshot makes answers reproducible and fast, with no runtime dependence on fragile government endpoints. Raw downloads are cached in `data/raw/`.

## 4. Scoring methodology

### Indices

Every index is a **weighted sum of KPI percentiles**. A KPI's percentile is its mid-rank position within a peer group, so a score of 0–100 reads as "stronger than X% of peers".

| Index                     | KPIs (weights)                                                                                                | Peer group         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Expansion Opportunity** | passenger CAGR 2023→2025 (30%), load factor (25%), NAS delay rate (20%), enplanements (15%), fare index (10%) | same FAA hub class |
| **Congestion**            | NAS delay rate (40%), NAS delay minutes per arrival (20%), arrival delay rate (20%), load factor (20%)        | all airports       |
| **Unmet Demand (proxy)**  | load factor (40%), fare index (30%), NAS delay rate (30%)                                                     | all airports       |

KPI choices:

- **NAS delay rate** is the share of arrivals delayed mainly by the National Aviation System (traffic volume, ATC, airport operations, non-extreme weather). It is the best public proxy for _infrastructure_ saturation, because it excludes airline-caused delays.
- **Fare index** is the passenger-weighted fare divided by the national average fare _for the same 500-mile distance band_. Without the distance adjustment, airports with long routes would look "expensive".
- **Growth uses 2023→2025** to measure the post-pandemic trend; recovery versus 2019 is reported separately.

**Why percentiles?** The KPIs have different units and heavy tails. Percentiles are robust to outliers, easy to explain, and invariant to monotonic transforms, so `log(enplanements)` gives the same result as enplanements.

**Why peer groups by hub size (Expansion Opportunity)?** It lets a growing small hub such as Portland, ME compete with Boston on how strong its signals are rather than on raw size. Scale still counts at 15%. Non-hubs (<0.05% of US traffic) are excluded from rankings by default because they are rarely terminal-investment targets; `includeNonHubs` brings them back.

### Missing data and confidence

If an airport has no data for a KPI (for example, no fare data for Alaska), that KPI drops out and its weight is redistributed proportionally. **Confidence** is _high_ when nothing is missing, _medium_ when up to 25% of the weight is missing, and _low_ above that or when the peer group has fewer than 10 airports. Every result carries `caveats` that say what was missing.

### Worked example (current snapshot)

_Unmet demand, SFO vs LAX:_

|     | Load factor (40%)    | Fare index (30%)    | NAS delay rate (30%) | Score    |
| --- | -------------------- | ------------------- | -------------------- | -------- |
| SFO | 82.3% → p90.5 → 36.2 | 1.04 → p55.0 → 16.5 | 17.3% → p99.9 → 30.0 | **82.7** |
| LAX | 81.6% → p87.0 → 34.8 | 0.99 → p37.7 → 11.3 | 5.0% → p66.8 → 20.0  | **66.1** |

SFO's planes are as full as LAX's, but its capacity-related delay rate is the highest in the country. The curated constraint explains why: closely spaced parallel runways, whose side-by-side approaches the FAA ended in March 2026. The agent reports this as context, separate from the score.

Other example results: in New England, BOS leads (69.4) on congestion and growth, ahead of PWM (65.2) and BDL (64.9). At ANC, 2.8% of passenger departures are long-haul (≥3,000 mi) versus 52.9% of all-cargo departures, which shows why the definition must be stated.

**Determinism.** The same snapshot and weights always give the same ranking. Ties are broken by airport code, and display rounding happens only after the score is computed. A full national ranking takes about 25 ms, so nothing is cached.

## 5. Where and how AI is used

| AI does                                                              | AI does not                                   |
| -------------------------------------------------------------------- | --------------------------------------------- |
| Interpret intent and entities ("LA" → LAX, "New England" → region)   | Compute or estimate any metric                |
| Choose tools and arguments, including weight overrides on request    | Decide methodology or default weights         |
| Resolve follow-up references from conversation history               | Use the curated constraints as scoring inputs |
| Explain results: top contributors, weakest KPI, assumptions, caveats | Show raw JSON                                 |

**Agent loop** (`src/agent/agent.ts`): an OpenAI-compatible tool-calling loop. It runs Gemini by default with DeepSeek as a fallback, switched by config; both work through the same SDK via their OpenAI-compatible endpoints. Guardrails:

- at most 6 tool rounds per turn, after which the model must answer
- streaming over SSE, with the turn aborted (stopping token spend) if the client disconnects
- fallback to the other provider on 429/5xx
- tool errors returned to the model as data, so it can correct its arguments
- rate limiting on `/api/chat`

**Follow-up questions.** The server stores the full history per session, _including tool calls and tool results_, and sends it every turn. That is how "why is the second one lower?" resolves to BDL with the exact numbers from the earlier ranking. The prompt requires the agent to state how it resolved a reference. When the history grows large, the oldest tool results are blanked first, while user and assistant messages are kept.

**Transparency in the UI.** Each answer shows a collapsible trace of the tool calls (name, arguments, one-line result), a confidence chip (the lowest across results) and data-period chips.

## 6. Assumptions and uncertainty

- **T-100 counts segments.** Multi-stop flights are counted per segment. Enplanements are measured as passengers on departing segments, which is close to, but not exactly, FAA CY enplanements.
- **Delay data covers reporting carriers only.** Airports served only by smaller carriers have no delay KPIs and get lower confidence (for example HVN).
- **Fares** cover domestic, contiguous-US markets only (no Alaska or Hawaii fares, no international fares).
- **Route data covers departures from US airports only.** Flights into the US from abroad (e.g. TLV→JFK) are not in T-100 as ingested, so the agent answers with the US-departure direction as a proxy and says so.
- **Long-haul** defaults to ≥3,000 statute miles (about 6+ hours). The threshold is a parameter and the agent states it.
- **Hub classes** are computed from T-100 shares using the FAA thresholds, so they may differ slightly from FAA's published list.
- **Unmet demand cannot be observed.** The index is a labelled proxy.
- **Weights are judgment calls.** They are made explicit, are configurable per query, and are documented here.

## 7. Key tradeoffs

| Decision                                       | Benefit                                                      | Cost                                                               |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Snapshot instead of live APIs                  | reproducible, fast, resilient                                | data is months old (BTS lag is unavoidable anyway)                 |
| Weighted percentiles instead of ML             | transparent and explainable; no training labels exist        | weights are expert judgment, not learned                           |
| Peer-group normalization                       | fair to small and medium hubs                                | scores across hub classes are relative, not absolute               |
| One OpenAI-compatible client for two providers | one agent loop and one tool format; provider swap via config | provider-specific features (e.g. Gemini native API) are not used   |
| Tool calling instead of RAG                    | the data is structured and numeric; exact results            | adding qualitative knowledge needs curation (the constraints file) |
| Plain HTML/JS UI                               | no build chain, easy to review                               | less component structure than React                                |

## 8. Deliberately not built

| Not built                 | Why not now                        | When it would be needed                                                           |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Database                  | read-only data that fits in memory | scheduled ingest, flight-level data → Postgres behind `AirportRepository`         |
| Queue / workers           | turns are short and streamed       | scheduled ingest, batch reports                                                   |
| Redis                     | single instance                    | multiple instances (shared sessions, cache)                                       |
| Auth, audit log           | demo scope                         | required for production investment workflows                                      |
| Profitability / ROI model | no public cost or financial data   | if the firm brings capex and financials, add a cost side next to the demand score |

## 9. Testing and evaluation

- **Unit tests** cover KPIs, percentiles, the scoring engine (weights sum to 1, redistribution, determinism, peer groups), route mix, the TTL cache and live-status parsing.
- **Service tests** run on the committed snapshot: each of the four brief questions must be answerable from tool output.
- **Agent tests** use a scripted fake LLM: the tool loop, full history on follow-ups, invalid tool arguments, provider fallback, the round limit, and no partial sessions after failures.
- **API tests** cover validation errors, 404s, and the SSE event sequence end to end.
- **`npm run eval`** runs the brief's questions plus a follow-up each against the real LLM, checks tool choice and arguments, and writes `docs/eval-results-<provider>.md` (DeepSeek: 10/10).
- **CI** runs typecheck, lint, format check, tests and build on Node 22 and 24.
