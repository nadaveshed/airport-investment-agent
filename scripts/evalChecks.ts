/** Small, deterministic checks for the brief's answers. These are regression checks, not an LLM judge. */
export interface AnswerChecks {
  numbers?: (string | number)[];
  terms?: RegExp[];
  forbiddenClaims?: RegExp[];
}

export function checkAnswer(answer: string, checks: AnswerChecks = {}): string | null {
  if (!answer.trim()) return 'expected a non-empty answer';
  const plain = answer.replaceAll(',', '').replaceAll('*', '');
  const numbers = (plain.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const expected of checks.numbers ?? []) {
    if (!numbers.includes(Number(String(expected).replaceAll(',', '')))) {
      return `answer is missing expected value ${expected}`;
    }
  }
  for (const term of checks.terms ?? []) {
    if (!term.test(plain)) return `answer is missing required explanation ${term}`;
  }
  for (const claim of checks.forbiddenClaims ?? []) {
    if (claim.test(plain)) return `answer contains an unsupported claim ${claim}`;
  }
  return null;
}

/** A filtered rank of 1 must not turn into "nationally first" in the SFO answer. */
export const NATIONAL_FIRST_CLAIMS = [
  /(?:top|highest|best)\s+(?:(?:unmet[\s-]demand|proxy|composite)\s+)?score[^.;\n]{0,100}(?:national|all\s+\d+|tracked\s+(?:US\s+)?airports|in\s+the\s+(?:US|country))/i,
  /national(?:ly)?\s*(?:rank(?:ed)?\s*)?(?:#\s*1\b|first\b|number\s*(?:one|1\b))/i,
];
