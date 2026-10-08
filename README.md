# Airport Investment Intelligence Agent

A chat agent that ranks and compares US airports using demand and congestion signals for expansion research. It uses public BTS, DOT and FAA data, scores airports deterministically, and explains its reasoning. Scores are screening indicators, not profit estimates or proof that terminal expansion will increase capacity. Voice input and spoken answers are supported.

![Chat UI answering the New England expansion question](docs/screenshot.png)

Design, scoring methodology and tradeoffs: **[docs/DESIGN.md](docs/DESIGN.md)**.

## Run

Requires Node 22+.

```bash
npm install
cp .env.example .env      # add GOOGLE_API_KEY and/or DEEPSEEK_API_KEY
npm run dev               # http://localhost:5173 (API on :3000)
```

For a production build, run `npm run build && npm start` and open http://localhost:3000. The UI is React + TypeScript in `frontend/`, built with Vite.

Gemini is the default model, with DeepSeek as a fallback when both keys are set. The free Gemini tier allows only about 20 requests a day, so for longer testing use a paid key or set `LLM_PROVIDER=deepseek`.

The data snapshot is committed. `npm run ingest` rebuilds it from the public sources.

## Other commands

- `npm test`: unit, agent and API tests
- `npm run check`: typecheck, lint, format
- `npm run eval`: ask the brief's questions and follow-ups to the real LLM; check tools, key values and caveats, and save transcripts for review (nonzero exit on failure)
