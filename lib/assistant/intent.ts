/**
 * Intent classifier (P4-3).
 *
 * Tags a user message with zero or more intents so the orchestrator
 * can pick the right refusal template (or pass through to KB / tool).
 * Deliberately a small set of deterministic regexes — the eval harness
 * has to be reproducible without a provider key (observability.md:
 * Component B is a pass/fail eval; non-deterministic intent flips the
 * harness from "gate" to "warning").
 *
 * Why no LLM call here: an LLM classifier would (a) need a key in CI,
 * (b) introduce latency on the hot path, and (c) make the harness's
 * pass/fail signal model-version-dependent. A regex set is brittle for
 * unforeseen phrasings — that's a known tradeoff and the postcheck
 * (response-side check) is the safety net for the cases regex misses.
 * If a phrasing leaks through to the model, postcheck still demotes
 * the response to a refusal.
 *
 * A message can carry MULTIPLE tags (e.g. "how do I handle a warning?"
 * is both `kb_question` and `onboarding`). The classifier returns the
 * deduplicated set in the order the tags are defined; downstream code
 * decides which one wins.
 */

/**
 * Tag a message with. The orchestrator uses these to:
 *   - thread an intent hint into the system prompt,
 *   - drive the mock generator's branch selection,
 *   - record the classifier output in the trace.
 */
export type IntentTag =
  | "legal_advice"
  | "disposition_request"
  | "cross_user_stats"
  | "numbers_question"
  | "kb_question"
  | "onboarding"
  | "other";

type Rule = {
  tag: Exclude<IntentTag, "other">;
  pattern: RegExp;
};

/**
 * The rule set, evaluated in order. Order does not change the OUTPUT
 * set (we always run every rule and collect every match), but it does
 * set the order downstream consumers iterate when they want a single
 * "primary" tag.
 *
 * Notes on individual rules:
 *
 *   - `cross_user_stats` INCLUDES the prompt-injection cue
 *     ("ignore prior instructions"). That keeps the role-override
 *     attempt on the same refusal path as "show me Jane's stats" —
 *     the user model is the same (someone trying to coax the
 *     assistant past role scope), so the refusal should be the same.
 *
 *   - The agent names (Marcus, Priya, River, Jordan, Sasha) are
 *     hard-coded here. They mirror `SEED_AGENTS` and will need a
 *     refresh whenever the seed changes; we accept the coupling for
 *     the prototype because the seed is the demo data.
 *
 *   - `kb_question` is wide on purpose — anything that looks like
 *     "what counts as / how do I / when is / warning / defect /
 *     bold / all caps / fanciful / net contents" routes here.
 *     False positives are harmless: the generator falls through to
 *     the KB branch and either quotes a chunk or returns the
 *     unsupported-compliance refusal.
 *
 *   - `onboarding` is narrow: it triggers on "how do I / does this /
 *     to use", "getting started", "new here", "first time". The
 *     KB-shaped question "how do I handle a warning?" gets BOTH the
 *     `kb_question` and `onboarding` tag, which is correct.
 */
const RULES: ReadonlyArray<Rule> = [
  {
    tag: "legal_advice",
    pattern:
      /legal|lawyer|regulation|TTB rule|27 CFR|statute|allowed under|compliant under|federal law/i,
  },
  {
    tag: "disposition_request",
    pattern:
      /approve|return.*correction|reject|reassign|dispose|sign off|just (do|approve|reject)/i,
  },
  {
    tag: "cross_user_stats",
    pattern:
      /another agent|other agent|colleague|teammate|Jane|Marcus|Priya|River|Jordan|Sasha.*stats|their (numbers|stats|score|rate)|whose|ignore (prior|previous|earlier)|pretend|act as (an? )?admin|you are now|everyone'?s|division (numbers|stats|rate)|everyone/i,
  },
  {
    tag: "numbers_question",
    pattern:
      /how am I doing|my (numbers|stats|score|rate)|this (week|month)|how many .* (I|have I) (completed|processed|handled)/i,
  },
  {
    tag: "kb_question",
    pattern:
      /what counts as|what is|how do I|when is|warning|defect|bold|all caps|fanciful|net contents/i,
  },
  {
    tag: "onboarding",
    pattern: /how (do I|does this|to use)|getting started|new here|first time/i,
  },
];

/**
 * Run every rule against the message and collect the matches. If no
 * rule fires, return `["other"]` as a single-element array — downstream
 * consumers can branch on `.includes("other")` without a length check.
 *
 * Returns a deduplicated, ordered array (order = rule definition
 * order). The result is a `ReadonlyArray` so callers can't mutate the
 * classifier's output.
 */
export function classifyIntent(message: string): ReadonlyArray<IntentTag> {
  const matched = new Set<IntentTag>();
  for (const rule of RULES) {
    if (rule.pattern.test(message)) {
      matched.add(rule.tag);
    }
  }
  if (matched.size === 0) {
    return ["other"];
  }
  // Re-emit in rule definition order for determinism. A Set's iteration
  // order matches insertion order, but downstream tests rely on the
  // deterministic order we lay out in RULES, so we re-walk RULES here.
  const ordered: IntentTag[] = [];
  for (const rule of RULES) {
    if (matched.has(rule.tag)) {
      ordered.push(rule.tag);
    }
  }
  return ordered;
}

/**
 * Tags that REQUIRE a refusal — the orchestrator surfaces an
 * `[INTENT HINT: ...]` line at the top of the prompt and the mock
 * generator branches into the fixed-shape template.
 */
export const REFUSAL_MANDATING_TAGS: ReadonlyArray<IntentTag> = [
  "legal_advice",
  "disposition_request",
  "cross_user_stats",
];

/**
 * True iff any of the tags in the set mandate a refusal.
 */
export function mandatesRefusal(
  tags: ReadonlyArray<IntentTag>,
): boolean {
  for (const t of tags) {
    if ((REFUSAL_MANDATING_TAGS as ReadonlyArray<IntentTag>).includes(t)) {
      return true;
    }
  }
  return false;
}
