import Link from "next/link";
import { Gift, Mail } from "lucide-react";
import { getInvitationPreview } from "@/app/actions/members";
import { getSessionUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcceptInviteButton } from "@/components/app/accept-invite-button";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, sessionUser] = await Promise.all([getInvitationPreview(token), getSessionUser()]);
  // Server component evaluated fresh per request — reading the current time here is intentional, not a purity bug.
  // eslint-disable-next-line react-hooks/purity
  const isExpired = invitation ? invitation.expiresAt.getTime() < Date.now() : false;

  if (!invitation || invitation.status !== "pending" || isExpired) {
    return (
      <Centered>
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle className="text-2xl">Invitation not found</CardTitle>
            <CardDescription>This invitation link is invalid, has expired, or was already used.</CardDescription>
          </CardHeader>
        </Card>
      </Centered>
    );
  }

  const nextUrl = `/invite/${token}`;

  return (
    <Centered>
      <Card>
        <CardHeader className="items-center text-center">
          <Gift className="mb-2 h-12 w-12 text-primary" />
          <CardTitle className="text-2xl">You&apos;re invited</CardTitle>
          <CardDescription>
            Join <span className="font-medium text-foreground">{invitation.businessName}</span> as{" "}
            <span className="font-medium text-foreground">{ROLE_LABELS[invitation.role]}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0" />
            {invitation.email}
          </div>

          {!sessionUser && (
            <div className="space-y-2">
              <Button nativeButton={false} render={<Link href={`/sign-in?next=${encodeURIComponent(nextUrl)}`} />} size="lg" className="w-full">
                Sign In to Accept
              </Button>
              <Button
                nativeButton={false}
                render={<Link href={`/sign-up?next=${encodeURIComponent(nextUrl)}`} />}
                size="lg"
                variant="secondary"
                className="w-full"
              >
                Create Account to Accept
              </Button>
            </div>
          )}

          {sessionUser && sessionUser.email !== invitation.email && (
            <p className="text-center text-sm text-destructive">
              You&apos;re signed in as {sessionUser.email}. Sign out and sign in with {invitation.email} to accept this
              invitation.
            </p>
          )}

          {sessionUser && sessionUser.email === invitation.email && <AcceptInviteButton token={token} />}
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
