"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/app/actions/members";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-2">
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await acceptInvitation(token);
          if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
          }
          router.push("/dashboard");
          router.refresh();
        }}
      >
        {pending ? "Joining..." : "Accept Invitation"}
      </Button>
    </div>
  );
}
