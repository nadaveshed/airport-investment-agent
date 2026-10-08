# Design

## What I measure

This one-day prototype does not collect project costs or airport finances, so it cannot estimate profit. Instead it screens demand signals: growth, full planes, congestion, size and pricing power. High scores suggest further investigation; they do not establish that terminal capacity is the bottleneck or that added capacity would fill.

Data: BTS T-100 traffic, BTS delay causes, DOT fares and OurAirports, for 396 US airports. `npm run ingest` builds it into a committed snapshot. At answer time the agent calls the FAA's live airport status API, and congestion and unmet-demand answers include a line on current conditions there. That line is context and never changes a score.

The agent's tools and the REST API use the same services, so every number the agent quotes can be checked with `GET /api/rankings` or `/api/compare`.

## Architecture

`scripts/ingest.ts` gathers public data into `data/snapshot.json`. At startup, the JSON repository loads it and the airport service computes KPIs. Pure functions in `src/domain/` calculate scores and route mixes; services expose them to both REST handlers and the agent's tools. The React chat receives text and tool events over SSE. Conversation history stays in memory for one hour of inactivity.

This keeps the one-day scope small: one server, one frontend, one committed dataset, no database or agent framework.

## Scoring

Each index is a weighted average of KPI percentiles on a 0–100 scale. The composite score is **not itself a percentile**: a score of 70 does not mean beating 70% of peers. Weights are in `src/config/scoring.config.ts`.

| Index                 | KPIs and weights                                                                                      | Peers              |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| Expansion Opportunity | passenger growth 2023→2025 30%, load factor 25%, NAS delay rate 20%, enplanements 15%, fare index 10% | same FAA hub class |
| Congestion            | NAS delay rate 40%, NAS delay minutes 20%, arrival delay rate 20%, load factor 20%                    | all airports       |
| Unmet Demand          | load factor 40%, fare index 30%, NAS delay rate 30%                                                   | all airports       |

- NAS delay rate is BTS `nas_ct` divided by all scheduled arrivals. BTS prorates flights with multiple delay causes according to their delay minutes, so the numerator counts equivalent delayed flights, not flights delayed primarily by NAS. NAS includes weather, ATC, traffic and airport operations; it does not isolate terminal capacity. [BTS definition](https://www.transtats.bts.gov/ot_delay/ot_delaycause1.asp).
- Comparing within hub size lets a growing small airport like Portland, ME compete with Boston. Tiny non-hubs are left out by default, since otherwise Portsmouth, NH topped New England.
- A missing KPI drops out, its weight moves to the others, and confidence goes down. Confidence reflects data completeness and peer-group size, not certainty about demand, causality or returns. Each KPI percentile uses only peers with that KPI available.
- Known constraints (JFK slots, the SNA passenger cap) are mentioned but never change a score.
- `selectionRank` is among `selectionSize` filtered candidates. `nationalRank` is among `nationalSize` tracked airports, including non-hubs. The normalization cohort is separate from both rankings. Expansion scores compare relative standing within hub classes, not absolute capacity across classes.

## Tradeoffs

- **Snapshot, not live BTS calls:** fast and repeatable, but months old (BTS lags 3–6 months anyway).
- **Weighted percentiles, not ML:** easy to follow, but the weights are my judgment. There's no data on which expansions paid off.
- **Demand, not profit:** built on data that exists, but the cost side is missing.
- **Departures only:** T-100 as ingested has no inbound international flights, so TLV→JFK is answered with JFK→TLV as a proxy.

## Where AI is used

The LLM (DeepSeek by default, Gemini as fallback) picks the tools and explains the results. Scores, ranks and component contributions are computed in code; the model is instructed to quote them. It maps questions to tool calls ("LA" → LAX), uses chat history for follow-ups ("the second one" → PWM), and explains what drove each score. It gets at most 6 tool rounds per answer, and the UI shows every tool call it made. Generated explanations can still be wrong and should be reviewed.

If a provider fails mid-stream, a `text_reset` event removes only that failed completion's text before a fallback. Invalid FAA responses fail validation; the service returns explicitly stale cached data or an unavailable error, rather than claiming no delays.

`npm run eval` checks tool selection, key answer values and caveats, and the SFO national-ranking regression. It saves transcripts for review and exits unsuccessfully when any check fails. These targeted checks do not prove every sentence correct; `npm test` covers deterministic calculations and failure handling.
