import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { devEmailOutbox } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default async function DevEmailsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const db = await getDb();
  const emails = await db.select().from(devEmailOutbox).orderBy(desc(devEmailOutbox.createdAt)).limit(100);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Badge variant="secondary" className="mb-2">Development Only</Badge>
          <h1 className="text-3xl font-bold">Email Outbox</h1>
          <p className="text-muted-foreground">
            No real email provider is configured yet — every email BillGod would send lands here instead.
          </p>
        </div>

        {emails.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No emails sent yet.</CardContent>
          </Card>
        )}

        {emails.map((email) => (
          <Card key={email.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-base">{email.subject}</CardTitle>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(email.createdAt)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">To: {email.to}</p>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-sm">{email.body}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
