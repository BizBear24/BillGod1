import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { devSmsOutbox } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default async function DevSmsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const db = await getDb();
  const messages = await db.select().from(devSmsOutbox).orderBy(desc(devSmsOutbox.createdAt)).limit(100);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Badge variant="secondary" className="mb-2">Development Only</Badge>
          <h1 className="text-3xl font-bold">SMS Outbox</h1>
          <p className="text-muted-foreground">
            No real SMS gateway is configured yet — every message BillGod would send lands here instead.
          </p>
        </div>

        {messages.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No messages sent yet.</CardContent>
          </Card>
        )}

        {messages.map((message) => (
          <Card key={message.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-base">To: {message.to}</CardTitle>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-sm">{message.body}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
