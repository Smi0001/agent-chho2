import { createTransport } from "nodemailer";
import type { NotifyConfig } from "../config/schema.js";

// Pluggable, best-effort notifications (feature B). A failed notification must never
// crash a run, so every send() swallows transport errors. Secrets (SMTP URL, Slack
// webhook) come from the environment, never from config.

export interface Notifier {
  /** Deliver a short notification. Best-effort: never throws. */
  send(subject: string, body: string): Promise<void>;
}

export class NullNotifier implements Notifier {
  async send(): Promise<void> {}
}

/** Sends email over SMTP via nodemailer (transport URL from CHHO2_SMTP_URL). */
export class EmailNotifier implements Notifier {
  constructor(
    private readonly smtpUrl: string,
    private readonly to: string,
    private readonly from: string,
  ) {}

  async send(subject: string, body: string): Promise<void> {
    try {
      const transport = createTransport(this.smtpUrl);
      await transport.sendMail({ from: this.from, to: this.to, subject: `[chho2] ${subject}`, text: body });
    } catch (err) {
      console.warn(`  (notify: email failed — ${(err as Error).message})`);
    }
  }
}

/** Posts to a Slack incoming webhook (URL from CHHO2_SLACK_WEBHOOK_URL). */
export class SlackNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async send(subject: string, body: string): Promise<void> {
    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `*[chho2] ${subject}*\n${body}` }),
      });
      if (!res.ok) console.warn(`  (notify: slack returned HTTP ${res.status})`);
    } catch (err) {
      console.warn(`  (notify: slack failed — ${(err as Error).message})`);
    }
  }
}

/** Fans out to several notifiers; each is independent and best-effort. */
export class MultiNotifier implements Notifier {
  constructor(private readonly notifiers: Notifier[]) {}

  async send(subject: string, body: string): Promise<void> {
    await Promise.allSettled(this.notifiers.map((n) => n.send(subject, body)));
  }
}

/**
 * Build a notifier from config + environment. `channels` declares intent; a channel
 * whose secret is missing is silently skipped (notifications are best-effort). Email
 * needs CHHO2_SMTP_URL + a recipient (config.email or CHHO2_NOTIFY_EMAIL); the from
 * address is CHHO2_NOTIFY_FROM or the recipient. Slack needs CHHO2_SLACK_WEBHOOK_URL.
 */
export function makeNotifier(cfg: NotifyConfig): Notifier {
  const out: Notifier[] = [];
  for (const channel of cfg.channels) {
    if (channel === "email") {
      const smtp = process.env.CHHO2_SMTP_URL;
      const to = cfg.email ?? process.env.CHHO2_NOTIFY_EMAIL;
      if (smtp && to) out.push(new EmailNotifier(smtp, to, process.env.CHHO2_NOTIFY_FROM ?? to));
    } else if (channel === "slack") {
      const url = process.env.CHHO2_SLACK_WEBHOOK_URL;
      if (url) out.push(new SlackNotifier(url));
    }
  }
  if (out.length) return new MultiNotifier(out);
  // Notifications are requested but nothing is configured: tell the user how to
  // enable (or silence) them, once per run, instead of failing silently.
  if (cfg.channels.length) {
    console.warn(
      "  ⓘ Notifications are on but no channel is configured. Set CHHO2_SMTP_URL (+ a recipient" +
        " via notify.email or CHHO2_NOTIFY_EMAIL) and/or CHHO2_SLACK_WEBHOOK_URL to receive them," +
        ' or set "notify": { "channels": [] } in .chho2.json to silence this.',
    );
  }
  return new NullNotifier();
}
