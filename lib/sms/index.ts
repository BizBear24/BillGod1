import "server-only";
import type { SmsService } from "./service";
import { DevSmsService } from "./dev-sms-service";
import { ProductionSmsService } from "./production-sms-service";

export type { SmsMessage, SmsService } from "./service";

let instance: SmsService | null = null;

export function getSmsService(): SmsService {
  if (!instance) {
    instance = process.env.SMS_PROVIDER === "production" ? new ProductionSmsService() : new DevSmsService();
  }
  return instance;
}
