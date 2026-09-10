import "server-only";
import { getDb } from "@/db/client";
import { devSmsOutbox } from "@/db/schema";
import type { SmsMessage, SmsService } from "./service";

/** Writes to a real DB table (viewable at /dev/messages) instead of sending SMS. */
export class DevSmsService implements SmsService {
  async send(message: SmsMessage): Promise<void> {
    const db = await getDb();
    await db.insert(devSmsOutbox).values({ to: message.to, body: message.body });
    console.log(`[dev-sms] to=${message.to} body="${message.body.slice(0, 60)}"`);
  }
}
