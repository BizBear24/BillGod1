import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { verifyEmail } from "@/app/actions/auth";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const [result, sessionUser] = await Promise.all([
    token ? verifyEmail(token) : Promise.resolve({ ok: false as const, error: "Missing verification token." }),
    getSessionUser(),
  ]);
  const continueHref = sessionUser?.activeBusinessId ? "/dashboard" : "/setup";

  return (
    <Card className="border-border">
      <CardHeader className="items-center text-center">
        {result.ok ? (
          <CheckCircle2 className="mb-2 h-12 w-12 text-chart-3" />
        ) : (
          <XCircle className="mb-2 h-12 w-12 text-destructive" />
        )}
        <CardTitle className="text-2xl">{result.ok ? "Email verified" : "Verification failed"}</CardTitle>
        <CardDescription>
          {result.ok ? "Your email is confirmed. You're all set." : result.error}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button nativeButton={false} render={<Link href={result.ok ? continueHref : "/sign-in"} />} size="lg" className="w-full">
          {result.ok ? "Continue" : "Back to Sign In"}
        </Button>
      </CardContent>
    </Card>
  );
}
