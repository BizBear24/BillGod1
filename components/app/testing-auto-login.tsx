"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { autoSignInForTesting } from "@/app/actions/testing-auth";

/**
 * Rendered instead of redirecting to /sign-in when SKIP_AUTH=true and no
 * session exists yet. Signs the fixed testing account in, then refreshes so
 * the page re-renders with a real session — see app/actions/testing-auth.ts.
 */
export function TestingAutoLogin() {
  const router = useRouter();

  React.useEffect(() => {
    void autoSignInForTesting().then((result) => {
      if (result.ok) router.refresh();
    });
  }, [router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}
