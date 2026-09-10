"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { inviteSchema, type InviteInput } from "@/lib/validation/members";
import { inviteMember, updateMemberRole, removeMember } from "@/app/actions/members";
import { ROLES, ROLE_LABELS, can, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";

type Member = { id: string; name: string; email: string; role: Role; status: string; createdAt: Date };
type Invitation = { id: string; email: string; role: Role; expiresAt: Date };

export function MembersManager({
  members,
  invitations,
  myRole,
}: {
  members: Member[];
  invitations: Invitation[];
  myRole: Role;
}) {
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const canInvite = can(myRole, PERMISSIONS.MEMBERS_INVITE);
  const canManage = can(myRole, PERMISSIONS.MEMBERS_MANAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team Members</h2>
        {canInvite && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger render={<Button size="lg" />}>
              <UserPlus className="h-4 w-4" />
              + Invite Team Member
            </DialogTrigger>
            <DialogContent>
              <InviteForm onSuccess={() => setInviteOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  {canManage && member.role !== "owner" ? (
                    <RoleSelect membershipId={member.id} currentRole={member.role} />
                  ) : (
                    <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {member.role !== "owner" && <RemoveButton membershipId={member.id} name={member.name} />}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Pending Invitations</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABELS[inv.role]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.expiresAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "cashier" },
  });

  async function onSubmit(values: InviteInput) {
    const result = await inviteMember(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(`Invitation sent to ${values.email}`);
    form.reset();
    onSuccess();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogDescription>They&apos;ll get an email with a link to join.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="teammate@shop.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(value: Role) => ROLE_LABELS[value]}</SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ROLES.filter((r) => r !== "owner").map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function RoleSelect({ membershipId, currentRole }: { membershipId: string; currentRole: Role }) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  return (
    <Select
      value={currentRole}
      disabled={pending}
      onValueChange={async (role) => {
        setPending(true);
        const result = await updateMemberRole({ membershipId, role: role as Role });
        setPending(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Role updated");
        router.refresh();
      }}
    >
      <SelectTrigger className="w-40">
        <SelectValue>{(value: Role) => ROLE_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ROLES.filter((r) => r !== "owner").map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const router = useRouter();

  if (!confirming) {
    return (
      <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(true)} aria-label={`Remove ${name}`}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">Remove {name}?</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await removeMember(membershipId);
          setPending(false);
          setConfirming(false);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${name} removed`);
          router.refresh();
        }}
      >
        Confirm
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
