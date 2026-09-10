import "server-only";
import { cookies } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, users, memberships, businesses } from "@/db/schema";
import { generateToken, hashToken } from "./tokens";
import type { Role } from "./permissions";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "billgod_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  activeBusinessId: string | null;
};

export type ActiveMembership = {
  businessId: string;
  businessName: string;
  role: Role;
};

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  /*
   * A session that starts with no active business is treated by the app layout
   * as "this user has not set up a shop yet", which would march a returning
   * owner back through the setup wizard every time they signed in. So a new
   * session adopts a business the user is already a member of.
   *
   * The most recent membership wins — that is the shop they were most recently
   * given access to — and the switcher in the header changes it from there. A
   * genuinely new user has no memberships, stays null, and correctly lands on
   * setup.
   */
  const [existing] = await db
    .select({ businessId: memberships.businessId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .orderBy(desc(memberships.createdAt))
    .limit(1);

  await db.insert(sessions).values({
    userId,
    tokenHash: hash,
    expiresAt,
    activeBusinessId: existing?.businessId ?? null,
  });

  return raw;
}

export async function setSessionCookie(rawToken: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_DURATION_MS),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const db = await getDb();
  const tokenHash = hashToken(raw);

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      activeBusinessId: sessions.activeBusinessId,
      userId: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email,
    name: row.name,
    emailVerified: !!row.emailVerifiedAt,
    activeBusinessId: row.activeBusinessId,
  };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

export async function invalidateSession(sessionId: string) {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function setActiveBusiness(sessionId: string, businessId: string) {
  const db = await getDb();
  await db.update(sessions).set({ activeBusinessId: businessId }).where(eq(sessions.id, sessionId));
}

/** Re-validates membership server-side; never trusts a client-supplied businessId. */
export async function getActiveMembership(sessionUser: SessionUser): Promise<ActiveMembership | null> {
  if (!sessionUser.activeBusinessId) return null;
  return getMembershipFor(sessionUser.userId, sessionUser.activeBusinessId);
}

export async function getMembershipFor(userId: string, businessId: string): Promise<ActiveMembership | null> {
  const db = await getDb();
  const rows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(businesses, eq(memberships.businessId, businesses.id))
    .where(eq(memberships.userId, userId))
    .limit(50);

  const match = rows.find((r) => r.businessId === businessId);
  return match ?? null;
}

export async function listMemberships(userId: string): Promise<ActiveMembership[]> {
  const db = await getDb();
  return db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(businesses, eq(memberships.businessId, businesses.id))
    .where(eq(memberships.userId, userId));
}
