import * as p from "@clack/prompts";
import type { Notifier } from "../notify/notifier.js";

export interface EscalatingConfirmOpts {
  message: string;
  timeoutSeconds: number;
  onTimeout: "wait" | "deny" | "proceed";
  notifier: Notifier;
}

/**
 * Confirm an outward action (feature B). If the user does not respond within
 * timeoutSeconds, escalate via the notifier and then wait/deny/proceed.
 *
 * Milestone 2 adds the visible countdown ("emailing in 10… 9…") and keypress-to-
 * cancel; this is the stable contract the orchestrator codes against.
 */
export async function confirmWithEscalation(opts: EscalatingConfirmOpts): Promise<boolean> {
  const answer = await p.confirm({ message: opts.message });
  if (p.isCancel(answer)) return false;
  return answer === true;
}
