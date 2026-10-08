/**
 * Runs the brief's example questions (each with a follow-up) against the real LLM and checks
 * tool selection and key answer values/caveats. Writes docs/eval-results.md.
 *
 *   npm run eval              # providers in .env order
 *   npm run eval -- deepseek  # one provider only, no fallback
 */
import { writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { loadEnv } from '../src/config/env.js';
import { buildContainer } from '../src/container.js';
import type { AgentEvent } from '../src/types/chat.js';
import { setLogLevel } from '../src/utils/logger.js';
import { rankAirportsSchema, routeMixSchema } from '../src/schemas/airport.schema.js';
import { checkAnswer, NATIONAL_FIRST_CLAIMS, type AnswerChecks } from './evalChecks.js';

interface ToolUse {
  name: string;
  args: Record<string, unknown>;
}

interface Turn {
  question: string;
  /** Returns null when the agent's tool usage is acceptable, or a reason when it is not. */
  check: (tools: ToolUse[]) => string | null;
  answerChecks?: (container: ReturnType<typeof buildContainer>) => AnswerChecks;
}

const used = (tools: ToolUse[], name: string) => tools.filter((t) => t.name === name);
const codesOf = (t: ToolUse) =>
  ((t.args.codes as string[] | undefined) ?? []).map((c) => c.toUpperCase());
const expect = (ok: boolean, reason: string) => (ok ? null : reason);
const expansionCaveat = /bottleneck|binding|constrain|due diligence|investigat|assess/i;
const liveChecked = (t: ToolUse[], code: string) =>
  used(t, 'get_live_status').some((u) => String(u.args.code).toUpperCase() === code);

const SCENARIOS: { name: string; turns: Turn[] }[] = [
  {
    name: 'Anchorage missing-data weights',
    turns: [
      {
        question:
          "What is ANC's unmet-demand score and why? Include current FAA status and quote the exact 'Weights after redistribution' caveat.",
        answerChecks: () => ({
          numbers: [58.8],
          terms: [/Load factor 57\.1%/i, /NAS delay rate 42\.9%/i, /low/i],
        }),
        check: (t) =>
          expect(
            used(t, 'rank_airports').some(
              (u) => codesOf(u).includes('ANC') && u.args.index === 'unmetDemand',
            ) && liveChecked(t, 'ANC'),
            'expected ANC unmet-demand score and live FAA status',
          ),
      },
      {
        question:
          'Show the configured and applied weights for each of those three KPIs in a table. Keep the same airport and index.',
        answerChecks: () => ({
          numbers: [40, 30, 57.1, 42.9],
          forbiddenClaims: [/^\|\s*NAS[^\n]*57\.1%/im, /^\|\s*Load factor[^\n]*42\.9%/im],
        }),
        check: (t) =>
          expect(
            t.length === 0 ||
              used(t, 'rank_airports').some(
                (u) => codesOf(u).includes('ANC') && u.args.index === 'unmetDemand',
              ),
            'expected reuse of ANC unmet-demand weights or the same ranking',
          ),
      },
    ],
  },
  {
    name: 'New England terminal expansion',
    turns: [
      {
        question: 'Which airports in New England are strong candidates for terminal expansion?',
        answerChecks: (c) => ({
          numbers: c.scoring
            .rank(rankAirportsSchema.parse({ region: 'new england' }))
            .results.slice(0, 3)
            .map((r) => r.score),
          terms: [/demand|screening/i, /terminal/i, expansionCaveat],
        }),
        check: (t) =>
          expect(
            used(t, 'rank_airports').some((u) => u.args.region === 'new england'),
            'expected rank_airports with region "new england"',
          ),
      },
      {
        question: 'Why is the second one ranked lower than the first?',
        answerChecks: (c) => ({
          terms: c.scoring
            .rank(rankAirportsSchema.parse({ region: 'new england' }))
            .results.slice(0, 2)
            .map((r) => new RegExp(`\\b${r.code}\\b`)),
        }),
        check: (t) =>
          expect(
            t.length === 0 ||
              t.some((u) =>
                ['get_airport_profile', 'compare_airports', 'rank_airports'].includes(u.name),
              ),
            'expected reuse of earlier results or a profile/compare call',
          ),
      },
    ],
  },
  {
    name: 'LA vs Santa Ana congestion',
    turns: [
      {
        question: 'Compare LA and Santa Ana airport congestion levels.',
        answerChecks: (c) => ({
          numbers: c.scoring
            .compare({ codes: ['LAX', 'SNA'], index: 'congestion' })
            .results.map((r) => r.score),
          terms: [/LAX/i, /SNA/i, /confidence/i],
        }),
        check: (t) =>
          expect(
            [...used(t, 'compare_airports'), ...used(t, 'rank_airports')].some((u) => {
              const codes = codesOf(u);
              return codes.includes('LAX') && codes.includes('SNA');
            }) &&
              liveChecked(t, 'LAX') &&
              liveChecked(t, 'SNA'),
            'expected compare/rank including LAX and SNA, plus live FAA status for both',
          ),
      },
      {
        question:
          'Which of the two has the larger share of delays caused by the air traffic system?',
        answerChecks: () => ({ terms: [/LAX/i, /prorat|equivalent|attribut/i, /arrivals/i] }),
        check: () => null, // answerable from the previous turn; any tool use is acceptable
      },
    ],
  },
  {
    name: 'Anchorage long-haul share',
    turns: [
      {
        question: 'What is the percentage of long haul flights out of Anchorage airport?',
        answerChecks: (c) => ({
          numbers: [
            c.routeMix.get(routeMixSchema.parse({ code: 'ANC' })).mix.passenger.longHaulSharePct!,
          ],
          terms: [/passenger/i, /cargo/i, /3000|3\s*000/i, /2025/],
        }),
        check: (t) =>
          expect(
            used(t, 'get_route_mix').some((u) => String(u.args.code).toUpperCase() === 'ANC'),
            'expected get_route_mix for ANC',
          ),
      },
      {
        question: 'And if long haul means 4,000 miles or more?',
        answerChecks: (c) => ({
          numbers: [
            4000,
            c.routeMix.get(routeMixSchema.parse({ code: 'ANC', longHaulMiles: 4000 })).mix.passenger
              .longHaulSharePct!,
          ],
          terms: [/passenger/i, /cargo/i],
        }),
        check: (t) =>
          expect(
            used(t, 'get_route_mix').some((u) => u.args.longHaulMiles === 4000),
            'expected get_route_mix with longHaulMiles 4000',
          ),
      },
    ],
  },
  {
    name: 'SFO unmet demand',
    turns: [
      {
        question: 'What is the unmet flight demand in SFO airport and why?',
        answerChecks: (c) => {
          const sfo = c.scoring.rank(
            rankAirportsSchema.parse({ codes: ['SFO'], index: 'unmetDemand' }),
          ).results[0]!;
          return {
            numbers: [sfo.score, sfo.nationalRank, sfo.nationalSize],
            terms: [/proxy/i, /confidence/i, /terminal/i, expansionCaveat],
            forbiddenClaims: NATIONAL_FIRST_CLAIMS,
          };
        },
        check: (t) =>
          expect(
            [...used(t, 'rank_airports'), ...used(t, 'compare_airports')].some(
              (u) => u.args.index === 'unmetDemand' && codesOf(u).includes('SFO'),
            ) && liveChecked(t, 'SFO'),
            'expected unmetDemand scoring and live FAA status for SFO',
          ),
      },
      {
        question: 'How does that compare with LAX?',
        answerChecks: (c) => ({
          numbers: c.scoring
            .compare({ codes: ['SFO', 'LAX'], index: 'unmetDemand' })
            .results.map((r) => r.score),
          terms: [/SFO/i, /LAX/i, /proxy|unmet/i],
        }),
        check: (t) =>
          expect(
            [...used(t, 'rank_airports'), ...used(t, 'compare_airports')].some((u) => {
              const codes = codesOf(u);
              return codes.includes('LAX') && u.args.index === 'unmetDemand';
            }),
            'expected unmetDemand scoring including LAX (index carried over from previous turn)',
          ),
      },
    ],
  },
  {
    name: 'International route with a foreign origin',
    turns: [
      {
        question: 'How many flights are there from Tel Aviv (TLV) to JFK, and how many passengers?',
        answerChecks: (c) => {
          const route = c.routeMix.route({ from: 'TLV', to: 'JFK' }).directions[1]!;
          return {
            numbers: 'passengers' in route ? [route.passengers, route.passengerDepartures] : [],
            terms: [/proxy|reverse|US.departure/i],
          };
        },
        check: (t) =>
          expect(
            used(t, 'get_route').some(
              (u) =>
                [u.args.from, u.args.to]
                  .map((c) => String(c).toUpperCase())
                  .sort()
                  .join() === 'JFK,TLV',
            ),
            'expected get_route for the JFK–TLV pair',
          ),
      },
      {
        question: 'How does that compare with Newark?',
        answerChecks: () => ({ terms: [/EWR|Newark/i] }),
        check: (t) =>
          expect(
            t.length === 0 || t.some((u) => ['get_route', 'get_airport_profile'].includes(u.name)),
            'expected reuse of the gateway list or a get_route/profile call',
          ),
      },
    ],
  },
];

async function main() {
  setLogLevel('warn');
  const forced = process.argv[2] as 'gemini' | 'deepseek' | undefined;
  // A forced run must measure that provider alone, so the other key is dropped (no fallback).
  const env = loadEnv(forced ? { ...process.env, LLM_PROVIDER: forced } : process.env);
  if (forced === 'gemini') env.DEEPSEEK_API_KEY = undefined;
  if (forced === 'deepseek') env.GOOGLE_API_KEY = undefined;
  const container = buildContainer(env);
  if (!container.agent.isConfigured) throw new Error('No LLM API key configured; see .env.example');

  const lines: string[] = [];
  let passed = 0;
  let total = 0;
  let model = '';

  for (const scenario of SCENARIOS) {
    lines.push(`## ${scenario.name}\n`);
    const session = container.chat.openSession();
    for (const turn of scenario.turns) {
      const tools: ToolUse[] = [];
      let answer = '';
      const start = performance.now();
      const onEvent = (e: AgentEvent) => {
        if (e.type === 'tool_call')
          tools.push({ name: e.name, args: (e.args ?? {}) as Record<string, unknown> });
        if (e.type === 'text') answer += e.delta;
        if (e.type === 'text_reset') answer = answer.slice(0, -e.removeChars);
        if (e.type === 'provider') model = `${e.provider} / ${e.model}`;
      };
      let failure: string | null;
      for (let attempt = 1; ; attempt++) {
        tools.length = 0;
        answer = '';
        try {
          await container.chat.send(
            container.chat.openSession(session.id),
            { message: turn.question },
            { onEvent, signal: AbortSignal.timeout(90_000) },
          );
          failure = turn.check(tools) ?? checkAnswer(answer, turn.answerChecks?.(container));
        } catch (err) {
          failure = `error: ${String(err)}`;
          // Free tiers allow only a few requests per minute; wait for the window to reset.
          if (/\((429|503)\)/.test(String(err)) && attempt < 4) {
            console.log(`  rate limited, retrying in 60s (attempt ${attempt})`);
            await new Promise((r) => setTimeout(r, 60_000));
            continue;
          }
        }
        break;
      }
      const seconds = ((performance.now() - start) / 1000).toFixed(1);
      total++;
      if (!failure) passed++;
      console.log(
        `${failure ? 'FAIL' : 'PASS'}  ${turn.question}${failure ? `  (${failure})` : ''}`,
      );

      lines.push(
        `### ${failure ? '❌' : '✅'} ${turn.question}\n`,
        `**Tools** (${seconds}s): ${tools.length ? tools.map((t) => `\`${t.name}(${JSON.stringify(t.args)})\``).join(', ') : '_none (answered from conversation)_'}\n`,
        ...(failure ? [`**Check failed:** ${failure}\n`] : []),
        `${answer.trim().replace(/^/gm, '> ')}\n`,
      );
    }
  }

  const header = [
    '# Agent evaluation',
    '',
    `Generated by \`npm run eval\` on ${new Date().toISOString().slice(0, 10)} with **${model}**.`,
    'Each scenario is one conversation: the follow-up question checks that context carries over.',
    'Checks verify tools, key answer values and caveats, including the SFO national-ranking regression. They do not prove every sentence correct; review the transcripts too.',
    '',
    `**Result: ${passed}/${total} checks passed.**`,
    '',
  ];
  const file = `docs/eval-results${forced ? `-${forced}` : ''}.md`;
  // Format like the rest of the repo so `npm run check` passes on the committed results.
  const markdown = [...header, ...lines].join('\n');
  await writeFile(file, await format(markdown, { ...(await resolveConfig(file)), filepath: file }));
  console.log(`\n${passed}/${total} passed → ${file}`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
