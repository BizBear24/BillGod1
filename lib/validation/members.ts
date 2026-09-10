import { z } from "zod";
import { ROLES, type Role } from "@/lib/auth/permissions";

export const roleSchema = z.enum(ROLES as unknown as [Role, ...Role[]]);

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: roleSchema,
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const updateRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: roleSchema,
});
