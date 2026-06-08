// Pluggable notifications (feature B). Default: email. A failed notification must
// never crash a run, so send() swallows transport errors.

export interface Notifier {
  error(subject: string, body: string): Promise<void>;
  needsApproval(subject: string, body: string): Promise<void>;
}

export class NullNotifier implements Notifier {
  async error(): Promise<void> {}
  async needsApproval(): Promise<void> {}
}

/**
 * Email notifier. Milestone 2 wires nodemailer using CHHO2_SMTP_URL and a real
 * "from" address; for now it logs what it would send.
 */
export class EmailNotifier implements Notifier {
  constructor(private readonly to: string) {}

  async error(subject: string, body: string): Promise<void> {
    await this.send(`[chho2] ERROR: ${subject}`, body);
  }

  async needsApproval(subject: string, body: string): Promise<void> {
    await this.send(`[chho2] approval needed: ${subject}`, body);
  }

  private async send(subject: string, _body: string): Promise<void> {
    try {
      // TODO(milestone 2): nodemailer transport from process.env.CHHO2_SMTP_URL
      console.error(`(notify stub) would email ${this.to}: ${subject}`);
    } catch {
      /* notifications are best-effort */
    }
  }
}

export function makeNotifier(channel: "none" | "email", email?: string): Notifier {
  if (channel === "email" && email) return new EmailNotifier(email);
  return new NullNotifier();
}
