# Design: Airport Investment Intelligence Agent

## Scope

The brief asks where renovations will be _most profitable_. No public data covers construction costs or airport finances, so the agent measures the **demand-driven case for expansion**: growth, full planes, saturated infrastructure, scale and pricing power. That is a precondition for profitable expansion, not a profit forecast, and the agent says so.

Coverage: 396 US airports with more than 10,000 annual enplanements. Data comes from BTS T-100 (traffic, 2019 and 2023–2025), BTS delay causes (last 12 months), the DOT fare report and OurAirports. `npm run ingest` builds it into a committed snapshot. The FAA NAS status API is called live for current delays.

## Architecture

```
Chat UI ──SSE──▶ Express API ──▶ Agent (LLM tool loop) ──▶ tools ─┐
                     └── REST endpoints ──────────────────────────┤
                                                                  ▼
                                         services ──▶ domain (pure scoring) + snapshot
```

Agent tools and REST endpoints call the same services, so any number the agent quotes can be reproduced with `GET /api/rankings` or `/api/compare`.

## Scoring methodology

Each index is a **weighted sum of KPI percentiles** (0–100, "stronger than X% of peers"). Weights live in `src/config/scoring.config.ts`, and the agent's prompt is generated from that file.

| Index                     | KPIs (weights)                                                                                                  | Compared against   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Expansion Opportunity** | passenger growth 2023→2025 (30%), load factor (25%), NAS delay rate (20%), enplanements (15%), fare index (10%) | same FAA hub class |
| **Congestion**            | NAS delay rate (40%), NAS delay minutes (20%), arrival delay rate (20%), load factor (20%)                      | all airports       |
| **Unmet Demand (proxy)**  | load factor (40%), fare index (30%), NAS delay rate (30%)                                                       | all airports       |

- **NAS delay rate** (delays caused by the air traffic system, not the airline) is the best public signal of infrastructure saturation.
- **Fare index** compares fares with the national average for the same distance band, so long routes don't look expensive.
- **Hub-class peers** let a growing small hub (PWM) compete with BOS on signal strength rather than size. Non-hubs are excluded from rankings by default.
- **Missing data** drops that KPI and spreads its weight over the rest. Confidence falls to medium or low accordingly, and the agent reports it.
- **Curated constraints** (slot controls, the SNA passenger cap, SFO runway spacing) are shown as context but never change a score.

Example: SFO scores 82.7 on unmet demand against 66.1 for LAX. Load factors are similar, but SFO has the highest capacity-delay rate in the US.

## Key tradeoffs

| Choice                             | Gain                                     | Cost                                        |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Snapshot instead of live BTS calls | fast, reproducible, no fragile endpoints | data is months old (BTS lags anyway)        |
| Weighted percentiles instead of ML | transparent; no training labels exist    | weights are judgment, not learned           |
| Demand proxy instead of profit     | built only on data that exists           | does not answer the cost side               |
| Tool calling instead of RAG        | exact numbers from structured data       | qualitative knowledge needs manual curation |
| T-100 departures only              | one consistent source                    | inbound international flights are missing   |

## Where and how AI is used

The LLM (Gemini, with DeepSeek as fallback) **plans and explains; it never computes numbers**.

- It maps the question to tools and arguments ("LA" → LAX, "New England" → region, long-haul threshold).
- It resolves follow-ups from the stored history, which includes earlier tool results ("why is the second one lower?" → BDL).
- It explains the result: the top contributing KPIs, the weakest one, assumptions, confidence and data periods.

Guardrails: at most 6 tool rounds per turn, invalid tool arguments returned to the model to fix, provider fallback on errors, and a tool trace shown under every answer in the UI.
