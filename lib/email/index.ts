import "server-only";
import type { EmailService } from "./service";
import { DevEmailService } from "./dev-email-service";
import { ProductionEmailService } from "./production-email-service";

export type { EmailMessage, EmailService } from "./service";

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) {
    instance = process.env.EMAIL_PROVIDER === "production" ? new ProductionEmailService() : new DevEmailService();
  }
  return instance;
}
