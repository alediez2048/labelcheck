/**
 * System prompt builder (P4-2).
 *
 * Assembles the imperative scaffolding the generator sees on every
 * turn. The prompt fixes two things hard:
 *   1. The assistant is read-only. The only tool it has is
 *      `get_my_rollup`. It cannot decide, dispose, reassign, or
 *      write to the KB (FR-30; CONTEXT.md Assistant).
 *   2. Knowledge is grounded ONLY in (a) the retrieved KB chunks
 *      and (b) the rollup tool. If neither helps, say so — do not
 *      improvise from training priors (observability.md: no
 *      fabricated rules).
 *
 * The prompt's KB context block is rendered explicitly even when
 * empty (as `--- KB CONTEXT EMPTY ---`), so the model can SEE the
 * fact that there was nothing to draw on rather than silently
 * proceeding without context.
 *
 * Hardening: P4-3 builds on top of this — refusal copy for legal
 * questions, role-scope leak checks, etc. The scaffolding here
 * already STATES the constraints; the next ticket adds the eval
 * gates that confirm the model respects them.
 */

import type { AssistantRole } from "@/types/assistant";
import type { KnowledgeBaseChunk } from "@/types/kb";

/**
 * Build the system prompt for a turn. The role and the retrieved
 * chunks are the only inputs — user messages are passed in the
 * messages array, not the system prompt.
 */
export function buildSystemPrompt(
  role: AssistantRole,
  retrievedChunks: ReadonlyArray<KnowledgeBaseChunk>,
): string {
  const sections: string[] = [];

  sections.push(
    "You are LabelCheck's read-only assistant. You help users with questions about how the tool works, onboarding, and summarising the caller's own role-scoped numbers.",
  );

  sections.push(
    "You can answer using ONLY two sources: (a) the knowledge base chunks provided in this turn's context, and (b) the result of the `get_my_rollup` tool when the caller asks about their own numbers.",
  );

  sections.push(
    "If neither source supports an answer, say so plainly. Do NOT improvise from training knowledge — if you do, the answer is wrong by construction.",
  );

  sections.push(
    `The caller's role is \`${role}\`. You can NOT look up another user's data. You can NOT make decisions, approve or return applications, reassign work, edit specialisations, change availability, or write to the knowledge base. You have exactly one tool: \`get_my_rollup\`.`,
  );

  sections.push(
    "When you cite a KB chunk, name the source filename and topic in the response. Do not invent source filenames.",
  );

  sections.push(renderKbContext(retrievedChunks));

  return sections.join("\n\n");
}

/**
 * Render the KB context block. Explicitly emits an EMPTY marker so
 * the model can see "the corpus had nothing for this query" rather
 * than reading silence as "no constraint".
 */
function renderKbContext(chunks: ReadonlyArray<KnowledgeBaseChunk>): string {
  if (chunks.length === 0) {
    return "--- KB CONTEXT EMPTY ---";
  }
  const blocks = chunks.map((c) => {
    const header = `[${c.sourceFilename}] (topic: ${c.topic}, v${c.version})`;
    return `${header}\n${c.body}`;
  });
  return [
    "--- KB CONTEXT START ---",
    blocks.join("\n\n"),
    "--- KB CONTEXT END ---",
  ].join("\n");
}
