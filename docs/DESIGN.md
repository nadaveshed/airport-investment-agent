# Design

## What I measure

There's no public data on construction costs or airport finances, so I can't score profit. Instead I score how strong the demand case for expansion is: growth, full planes, congestion, size and pricing power. The agent says this when it matters.

Data: BTS T-100 traffic, BTS delay causes, DOT fares and OurAirports, for 396 US airports. `npm run ingest` builds it into a committed snapshot. The FAA status API is called live for current delays.

The agent's tools and the REST API use the same services, so every number the agent quotes can be checked with `GET /api/rankings` or `/api/compare`.

## Scoring

Each index is a weighted average of KPI percentiles: a score of 70 beats 70% of peers. Weights are in `src/config/scoring.config.ts`.

| Index                 | KPIs and weights                                                                                      | Peers              |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| Expansion Opportunity | passenger growth 2023→2025 30%, load factor 25%, NAS delay rate 20%, enplanements 15%, fare index 10% | same FAA hub class |
| Congestion            | NAS delay rate 40%, NAS delay minutes 20%, arrival delay rate 20%, load factor 20%                    | all airports       |
| Unmet Demand          | load factor 40%, fare index 30%, NAS delay rate 30%                                                   | all airports       |

- NAS delays (caused by the system, not the airline) are my main signal for an airport at capacity.
- Comparing within hub size lets a growing small airport like Portland, ME compete with Boston. Tiny non-hubs are left out by default, since otherwise Portsmouth, NH topped New England.
- A missing KPI drops out, its weight moves to the others, and confidence goes down.
- Known constraints (JFK slots, the SNA passenger cap) are mentioned but never change a score.

## Tradeoffs

- **Snapshot, not live BTS calls:** fast and repeatable, but months old (BTS lags 3–6 months anyway).
- **Weighted percentiles, not ML:** easy to follow, but the weights are my judgment. There's no data on which expansions paid off.
- **Demand, not profit:** built on data that exists, but the cost side is missing.
- **Departures only:** T-100 as ingested has no inbound international flights, so TLV→JFK is answered with JFK→TLV as a proxy.

## Where AI is used

The LLM (Gemini, with DeepSeek as fallback) picks the tools and explains the results. It never calculates a number. It maps questions to tool calls ("LA" → LAX), uses the chat history for follow-ups ("the second one" → BDL), and explains what drove each score. It gets at most 6 tool rounds per answer, and the UI shows every tool call it made.
