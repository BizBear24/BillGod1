import type { SmsMessage, SmsService } from "./service";

/**
 * Not implemented yet — a real gateway (MSG91, Twilio, Gupshup…) plugs in
 * here. Throws instead of silently pretending the SMS went out, so a shop
 * never believes a reminder was delivered when it wasn't.
 */
export class ProductionSmsService implements SmsService {
  async send(message: SmsMessage): Promise<void> {
    void message;
    throw new Error("No production SMS provider is configured yet. Set SMS_PROVIDER=dev for local development.");
  }
}
