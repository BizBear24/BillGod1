"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";

const TESTING_EMAIL = "testing@billgod.local";

/**
 * Auto-provisions and signs in a fixed local account when SKIP_AUTH=true, so
 * the app opens straight through to the dashboard instead of stopping at the
 * sign-in wall — a testing-phase convenience, not a real auth bypass: it only
 * ever activates behind this env flag, and reaches exactly one account.
 *
 * Turn it off by removing SKIP_AUTH (or setting it to anything but "true")
 * once real accounts are what should gate the app.
 */
export async function autoSignInForTesting(): Promise<{ ok: boolean }> {
  if (process.env.SKIP_AUTH !== "true") return { ok: false };

  const db = await getDb();
  let [user] = await db.select().from(users).where(eq(users.email, TESTING_EMAIL)).limit(1);
  if (!user) {
    const passwordHash = await hashPassword(crypto.randomUUID());
    [user] = await db
      .insert(users)
      .values({ name: "Testing", email: TESTING_EMAIL, passwordHash, emailVerifiedAt: new Date() })
      .returning();
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);
  return { ok: true };
}
