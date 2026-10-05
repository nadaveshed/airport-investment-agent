/**
 * Runs the brief's example questions (each with a follow-up) against the real LLM and checks
 * that the agent picked the right tools and arguments. Writes docs/eval-results.md.
 *
 *   npm run eval              # providers in .env order
 *   npm run eval -- deepseek  # force one provider
 */
import { writeFile } from 'node:fs/promises';
import { loadEnv } from '../src/config/env.js';
import { buildContainer } from '../src/container.js';
import type { AgentEvent } from '../src/types/chat.js';
import { setLogLevel } from '../src/utils/logger.js';

interface ToolUse {
  name: string;
  args: Record<string, unknown>;
}

interface Turn {
  question: string;
  /** Returns null when the agent's tool usage is acceptable, or a reason when it is not. */
  check: (tools: ToolUse[]) => string | null;
}

const used = (tools: ToolUse[], name: string) => tools.filter((t) => t.name === name);
const codesOf = (t: ToolUse) =>
  ((t.args.codes as string[] | undefined) ?? []).map((c) => c.toUpperCase());
const expect = (ok: boolean, reason: string) => (ok ? null : reason);

const SCENARIOS: { name: string; turns: Turn[] }[] = [
  {
    name: 'New England terminal expansion',
    turns: [
      {
        question: 'Which airports in New England are strong candidates for terminal expansion?',
        check: (t) =>
          expect(
            used(t, 'rank_airports').some((u) => u.args.region === 'new england'),
            'expected rank_airports with region "new england"',
          ),
      },
      {
        question: 'Why is the second one ranked lower than the first?',
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
        check: (t) =>
          expect(
            [...used(t, 'compare_airports'), ...used(t, 'rank_airports')].some((u) => {
              const codes = codesOf(u);
              return codes.includes('LAX') && codes.includes('SNA');
            }),
            'expected compare/rank including LAX and SNA',
          ),
      },
      {
        question:
          'Which of the two has the larger share of delays caused by the air traffic system?',
        check: () => null, // answerable from the previous turn; any tool use is acceptable
      },
    ],
  },
  {
    name: 'Anchorage long-haul share',
    turns: [
      {
        question: 'What is the percentage of long haul flights out of Anchorage airport?',
        check: (t) =>
          expect(
            used(t, 'get_route_mix').some((u) => String(u.args.code).toUpperCase() === 'ANC'),
            'expected get_route_mix for ANC',
          ),
      },
      {
        question: 'And if long haul means 4,000 miles or more?',
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
        check: (t) =>
          expect(
            [...used(t, 'rank_airports'), ...used(t, 'compare_airports')].some(
              (u) => u.args.index === 'unmetDemand' && codesOf(u).includes('SFO'),
            ),
            'expected unmetDemand scoring for SFO',
          ),
      },
      {
        question: 'How does that compare with LAX?',
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
];

async function main() {
  setLogLevel('warn');
  const forced = process.argv[2] as 'gemini' | 'deepseek' | undefined;
  const env = loadEnv(forced ? { ...process.env, LLM_PROVIDER: forced } : process.env);
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
        if (e.type === 'provider') model = `${e.provider} / ${e.model}`;
      };
      let failure: string | null;
      try {
        await container.chat.send(
          container.chat.openSession(session.id),
          { message: turn.question },
          { onEvent },
        );
        failure = turn.check(tools);
      } catch (err) {
        failure = `error: ${String(err)}`;
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
    'Checks verify tool selection and arguments; scores themselves are covered by unit tests.',
    '',
    `**Result: ${passed}/${total} checks passed.**`,
    '',
  ];
  const file = `docs/eval-results${forced ? `-${forced}` : ''}.md`;
  await writeFile(file, [...header, ...lines].join('\n'));
  console.log(`\n${passed}/${total} passed → ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
