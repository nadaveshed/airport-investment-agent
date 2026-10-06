# Design notes

## What I'm actually measuring

The brief asks which renovations would be most profitable. There's no public data on construction costs or airport finances, so I couldn't model profit. What I score instead is how strong the demand case for expansion is: is traffic growing, are planes full, is the airport already congested, how big is it, and can airlines charge more there. Strong demand doesn't guarantee a good investment, but without it there's no case at all. The agent says this when it matters.

The data covers 396 US airports with more than 10,000 passengers a year:

- BTS T-100 for traffic (2019 and 2023–2025)
- BTS delay causes for the last 12 months
- the DOT fare report
- OurAirports for names and locations

`npm run ingest` downloads all of it and builds `data/snapshot.json`, which is committed so the app runs without the ingest step. The only live call is the FAA status API, for current ground stops and delays.

## Architecture

```
Chat UI ──SSE──▶ Express API ──▶ Agent (LLM tool loop) ──▶ tools ─┐
                     └── REST endpoints ──────────────────────────┤
                                                                  ▼
                                         services ──▶ domain (pure scoring) + snapshot
```

The agent's tools and the REST endpoints go through the same services. If the agent says BOS scored 69.4, `GET /api/rankings?region=new england` returns the same 69.4.

## Scoring

Every index is a weighted average of KPI percentiles, so a score of 70 means the airport beats 70% of its peers on that mix. The weights are in `src/config/scoring.config.ts`. The agent's system prompt is built from that file, so the methodology it explains always matches the code.

| Index                 | KPIs and weights                                                                                      | Peers              |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| Expansion Opportunity | passenger growth 2023→2025 30%, load factor 25%, NAS delay rate 20%, enplanements 15%, fare index 10% | same FAA hub class |
| Congestion            | NAS delay rate 40%, NAS delay minutes 20%, arrival delay rate 20%, load factor 20%                    | all airports       |
| Unmet Demand          | load factor 40%, fare index 30%, NAS delay rate 30%                                                   | all airports       |

Some of the choices behind this:

- I lean on the NAS delay rate a lot. It counts delays caused by the air traffic system and the airport, not by the airline, which makes it the closest public signal for "this airport is at capacity".
- Fares are compared with the national average for routes of similar length. Otherwise airports with long routes would look expensive.
- Expansion Opportunity compares airports only with others of the same FAA hub size. Without that, BOS wins everything on size alone, and a fast-growing small airport like Portland, ME never shows up. Tiny non-hub airports are left out of rankings by default. With them in, Portsmouth, NH came out first in New England, which made no sense for an investor.
- When an airport is missing a KPI (Alaska has no fare data, for example), that KPI drops out and its weight is spread over the others. The result is marked medium or low confidence so the user knows.
- Known constraints like slot controls at JFK, the passenger cap at SNA or SFO's runway spacing come from a small hand-curated file. The agent mentions them, but they never change a score.

An example of how it reads: SFO scores 82.7 on unmet demand and LAX 66.1. Planes are about as full at both, but SFO has the highest rate of capacity-related delays in the country, and its runway layout explains why.

## Tradeoffs

- **Snapshot instead of calling BTS live.** Answers are fast and repeatable, and a slow government site can't break the app. The cost is data that's a few months old, but BTS publishes with a 3–6 month lag anyway.
- **Weighted percentiles instead of a model.** Anyone can follow how a score was built. The weights are my judgment, though. Nothing is learned, because there's no labelled data on which expansions paid off.
- **Demand instead of profit.** Everything rests on data that actually exists, but the cost side of the investment is missing.
- **Tool calling instead of RAG.** The data is numbers in tables, so tools give exact values. Anything qualitative has to be curated by hand.
- **Departures only.** T-100 as I ingest it has flights leaving US airports, so TLV→JFK isn't there. The agent answers with JFK→TLV and says it's a proxy.

## Where the AI comes in

The LLM (Gemini by default, DeepSeek as a fallback) decides what to look up and explains the results. It never calculates a number itself. Its jobs are to:

- turn the question into tool calls, for example "LA" → LAX, "New England" → a region, or picking a long-haul threshold
- handle follow-ups from the conversation history, which includes earlier tool results, so "why is the second one lower?" resolves to BDL
- explain what drove a score, what held it back, and what was assumed

To keep it in line, it gets at most 6 tool rounds per answer, bad tool arguments go back to it as errors so it can retry, and the UI shows the tool calls under every answer so you can check its work.
