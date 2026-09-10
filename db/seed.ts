import "dotenv/config";
import { getDb } from "./client";
import { permissions, rolePermissions } from "./schema";
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS, ROLES } from "@/lib/auth/permissions";

async function main() {
  const db = await getDb();

  const permissionRows = Object.values(PERMISSIONS).map((key) => ({
    key,
    description: PERMISSION_DESCRIPTIONS[key],
  }));

  for (const row of permissionRows) {
    await db.insert(permissions).values(row).onConflictDoUpdate({
      target: permissions.key,
      set: { description: row.description },
    });
  }

  await db.delete(rolePermissions);
  for (const role of ROLES) {
    for (const permissionKey of ROLE_PERMISSIONS[role]) {
      await db.insert(rolePermissions).values({ role, permissionKey });
    }
  }

  console.log(`Seeded ${permissionRows.length} permissions across ${ROLES.length} roles.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
