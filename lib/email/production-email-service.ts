import type { EmailMessage, EmailService } from "./service";

/**
 * Not implemented yet — wired up to a real transactional email provider
 * (e.g. SES/Postmark/Resend) in a later phase. Throws instead of silently
 * pretending mail was sent (spec: never fake functionality).
 */
export class ProductionEmailService implements EmailService {
  async send(message: EmailMessage): Promise<void> {
    void message;
    throw new Error(
      "No production email provider is configured yet. Set EMAIL_PROVIDER=dev for local development."
    );
  }
}
