"use server";

import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, memberships, invitations, businesses } from "@/db/schema";
import { requireSessionUser, getActiveMembership, getSessionUser, setActiveBusiness } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { getEmailService } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { inviteSchema, updateRoleSchema } from "@/lib/validation/members";
import type { ActionResult } from "./auth";

export async function listMembers() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.MEMBERS_VIEW)) {
    throw new Error("FORBIDDEN");
  }

  const db = await getDb();
  const memberRows = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      status: memberships.status,
      name: users.name,
      email: users.email,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.businessId, membership.businessId));

  const invitationRows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.businessId, membership.businessId), eq(invitations.status, "pending")));

  return { members: memberRows, invitations: invitationRows, myRole: membership.role };
}

export async function inviteMember(input: unknown): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.MEMBERS_INVITE)) {
    return { ok: false, error: "You don't have permission to invite team members." };
  }

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, membership.businessId)).limit(1);

  const { raw, hash } = generateToken();
  await db.insert(invitations).values({
    businessId: membership.businessId,
    email: parsed.data.email,
    role: parsed.data.role,
    tokenHash: hash,
    invitedBy: sessionUser.userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const inviteUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${raw}`;
  await getEmailService().send({
    to: parsed.data.email,
    subject: `You've been invited to join ${business?.name ?? "a business"} on BillGod`,
    body: `${sessionUser.name} invited you to join ${business?.name ?? "their business"} as ${parsed.data.role}.\n\nAccept the invitation:\n${inviteUrl}\n\nThis invite expires in 7 days.`,
  });

  await logAudit({
    businessId: membership.businessId,
    userId: sessionUser.userId,
    action: "member.invited",
    entityType: "invitation",
    after: { email: parsed.data.email, role: parsed.data.role },
  });

  return { ok: true };
}

export async function updateMemberRole(input: unknown): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.MEMBERS_MANAGE)) {
    return { ok: false, error: "You don't have permission to change roles." };
  }

  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();
  const [target] = await db.select().from(memberships).where(eq(memberships.id, parsed.data.membershipId)).limit(1);
  if (!target || target.businessId !== membership.businessId) {
    return { ok: false, error: "Member not found." };
  }
  if (target.role === "owner") {
    return { ok: false, error: "The business owner's role can't be changed here." };
  }

  await db.update(memberships).set({ role: parsed.data.role }).where(eq(memberships.id, target.id));

  await logAudit({
    businessId: membership.businessId,
    userId: sessionUser.userId,
    action: "member.role_changed",
    entityType: "membership",
    entityId: target.id,
    before: { role: target.role },
    after: { role: parsed.data.role },
  });

  return { ok: true };
}

export async function removeMember(membershipId: string): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.MEMBERS_MANAGE)) {
    return { ok: false, error: "You don't have permission to remove team members." };
  }

  const db = await getDb();
  const [target] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!target || target.businessId !== membership.businessId) {
    return { ok: false, error: "Member not found." };
  }
  if (target.role === "owner") {
    return { ok: false, error: "The business owner can't be removed." };
  }

  await db.delete(memberships).where(eq(memberships.id, target.id));

  await logAudit({
    businessId: membership.businessId,
    userId: sessionUser.userId,
    action: "member.removed",
    entityType: "membership",
    entityId: target.id,
  });

  return { ok: true };
}

export async function getInvitationPreview(token: string) {
  const db = await getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      businessName: businesses.name,
      businessId: invitations.businessId,
    })
    .from(invitations)
    .innerJoin(businesses, eq(invitations.businessId, businesses.id))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}

export async function acceptInvitation(token: string): Promise<ActionResult> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { ok: false, error: "Sign in first to accept this invitation." };
  }

  const db = await getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
    .limit(1);

  const invitation = rows[0];
  if (!invitation) {
    return { ok: false, error: "This invitation is invalid or has expired." };
  }

  if (invitation.email !== sessionUser.email) {
    return { ok: false, error: `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.` };
  }

  const existing = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, sessionUser.userId), eq(memberships.businessId, invitation.businessId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(memberships).values({
      userId: sessionUser.userId,
      businessId: invitation.businessId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
    });
  }

  await db.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, invitation.id));
  await setActiveBusiness(sessionUser.sessionId, invitation.businessId);

  await logAudit({
    businessId: invitation.businessId,
    userId: sessionUser.userId,
    action: "member.joined",
    entityType: "membership",
    after: { role: invitation.role },
  });

  return { ok: true };
}
