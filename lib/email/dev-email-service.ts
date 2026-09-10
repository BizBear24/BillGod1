import "server-only";
import { getDb } from "@/db/client";
import { devEmailOutbox } from "@/db/schema";
import type { EmailMessage, EmailService } from "./service";

/** Writes to a real DB table (viewable at /dev/emails) instead of sending mail. */
export class DevEmailService implements EmailService {
  async send(message: EmailMessage): Promise<void> {
    const db = await getDb();
    await db.insert(devEmailOutbox).values({
      to: message.to,
      subject: message.subject,
      body: message.body,
    });
    console.log(`[dev-email] to=${message.to} subject="${message.subject}"`);
  }
}
