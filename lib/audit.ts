import "server-only";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function logAudit(entry: {
  businessId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  const db = await getDb();
  await db.insert(auditLogs).values({
    businessId: entry.businessId ?? null,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
