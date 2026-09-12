"use server";

import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, passwordResetTokens } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { createSession, setSessionCookie, clearSessionCookie, getSessionUser, invalidateSession, requireSessionUser } from "@/lib/auth/session";
import { getEmailService } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { signUpSchema, signInSchema, requestResetSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { z } from "zod";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function signUp(input: unknown): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, password } = parsed.data;

  try {
    const db = await getDb();
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({ name, email, passwordHash, emailVerifiedAt: new Date() }).returning();

    await logAudit({ userId: user.id, action: "user.sign_up", entityType: "user", entityId: user.id });

    const sessionToken = await createSession(user.id);
    await setSessionCookie(sessionToken);

    return { ok: true };
  } catch (err) {
    console.error("[auth] signUp failed:", err);
    return { ok: false, error: "Account creation failed. Please check server configuration." };
  }
}

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password } = parsed.data;

  try {
    const db = await getDb();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user) {
      return { ok: false, error: "Incorrect email or password." };
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return { ok: false, error: "Incorrect email or password." };
    }

    const sessionToken = await createSession(user.id);
    await setSessionCookie(sessionToken);
    await logAudit({ userId: user.id, action: "user.sign_in", entityType: "user", entityId: user.id });

    return { ok: true };
  } catch (err) {
    console.error("[auth] signIn failed:", err);
    return { ok: false, error: "Sign in failed. Please check server configuration." };
  }
}

export async function signOut(): Promise<void> {
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    await invalidateSession(sessionUser.sessionId);
    await logAudit({ userId: sessionUser.userId, action: "user.sign_out", entityType: "user", entityId: sessionUser.userId });
  }
  await clearSessionCookie();
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const user = rows[0];

  // Always report success even if the account doesn't exist, to avoid leaking which emails are registered.
  if (user) {
    const { raw, hash } = generateToken();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${raw}`;
    // Best-effort: no mail provider being configured must never block or
    // fail this action, since the response already avoids confirming whether
    // the account exists either way.
    try {
      await getEmailService().send({
        to: user.email,
        subject: "Reset your BillGod password",
        body: `Hi ${user.name},\n\nReset your password using this link:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
      });
    } catch (err) {
      console.error("[auth] password reset email failed to send:", err);
    }
    await logAudit({ userId: user.id, action: "user.password_reset_requested", entityType: "user", entityId: user.id });
  }

  return { ok: true };
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();
  const tokenHash = hashToken(parsed.data.token);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.id));
  await logAudit({ userId: row.userId, action: "user.password_reset", entityType: "user", entityId: row.userId });

  return { ok: true };
}

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email address"),
});

export async function updateProfile(input: unknown): Promise<ActionResult> {
  try {
    const sessionUser = await requireSessionUser();
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const db = await getDb();
    // Check email uniqueness only if it changed
    if (parsed.data.email.toLowerCase() !== sessionUser.email.toLowerCase()) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
      if (existing) return { ok: false, error: "That email is already in use." };
    }
    await db.update(users).set({ name: parsed.data.name, email: parsed.data.email.toLowerCase(), updatedAt: new Date() }).where(eq(users.id, sessionUser.userId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update profile." };
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function changePassword(input: unknown): Promise<ActionResult> {
  try {
    const sessionUser = await requireSessionUser();
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.userId)).limit(1);
    if (!user) return { ok: false, error: "User not found." };
    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, sessionUser.userId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to change password." };
  }
}
