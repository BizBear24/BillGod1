"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, FileText, Inbox, AlertCircle } from "lucide-react";
import { saveMessageTemplate, deleteMessageTemplate, sendMessage, previewMessage } from "@/app/actions/engagement";
import {
  MESSAGE_CHANNELS,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_EVENTS,
  MESSAGE_EVENT_LABELS,
  TEMPLATE_PLACEHOLDERS,
} from "@/lib/validation/engagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/utils";

type Channel = (typeof MESSAGE_CHANNELS)[number];
type EventKey = (typeof MESSAGE_EVENTS)[number];
type Template = { id: string; channel: string; eventKey: string; name: string; subject: string | null; body: string };
type Customer = { id: string; name: string; phone: string | null; email: string | null };
type LogRow = {
  id: string;
  channel: string;
  eventKey: string | null;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  error: string | null;
  createdAt: Date;
};
type OutstandingRow = { id: string; name: string; phone: string | null; email: string | null; outstanding: number };

export function CommunicationsManager({
  templates,
  customers,
  messageLog,
  outstanding,
  canSend,
}: {
  templates: Template[];
  customers: Customer[];
  messageLog: LogRow[];
  outstanding: OutstandingRow[];
  canSend: boolean;
}) {
  const [tab, setTab] = React.useState("send");

  if (!canSend) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You don&apos;t have permission to send messages.</CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="send">
          <Send className="h-4 w-4" />
          Send
        </TabsTrigger>
        <TabsTrigger value="templates">
          <FileText className="h-4 w-4" />
          Templates
        </TabsTrigger>
        <TabsTrigger value="log">
          <Inbox className="h-4 w-4" />
          Sent log
        </TabsTrigger>
      </TabsList>

      <TabsContent value="send" className="space-y-4">
        <Composer templates={templates} customers={customers} />
        <OutstandingList rows={outstanding} />
      </TabsContent>

      <TabsContent value="templates">
        <TemplateEditor templates={templates} />
      </TabsContent>

      <TabsContent value="log">
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Sent messages</p>
            {messageLog.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing sent yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messageLog.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                        <TableCell>{MESSAGE_CHANNEL_LABELS[row.channel as Channel] ?? row.channel}</TableCell>
                        <TableCell>{row.recipient}</TableCell>
                        <TableCell className="max-w-md truncate text-muted-foreground">{row.subject ? `${row.subject} — ` : ""}{row.body}</TableCell>
                        <TableCell>
                          {row.status === "failed" ? (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {row.error ?? "failed"}
                            </span>
                          ) : (
                            <Badge variant="secondary">{row.status}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function Composer({ templates, customers }: { templates: Template[]; customers: Customer[] }) {
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel>("sms");
  const [eventKey, setEventKey] = React.useState<EventKey>("invoice");
  const [customerId, setCustomerId] = React.useState(customers[0]?.id ?? "");
  const [recipient, setRecipient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const channelItems = React.useMemo(() => MESSAGE_CHANNELS.map((c) => ({ value: c, label: MESSAGE_CHANNEL_LABELS[c] })), []);
  const eventItems = React.useMemo(() => MESSAGE_EVENTS.map((e) => ({ value: e, label: MESSAGE_EVENT_LABELS[e] })), []);
  const customerItems = React.useMemo(() => customers.map((c) => ({ value: c.id, label: c.name })), [customers]);

  async function fillFromTemplate(nextChannel: Channel, nextEvent: EventKey, nextCustomerId: string) {
    const template = templates.find((t) => t.channel === nextChannel && t.eventKey === nextEvent);
    if (!template) {
      toast.error("No template saved for that channel and event yet.");
      return;
    }
    const preview = await previewMessage({
      channel: nextChannel,
      eventKey: nextEvent,
      customerId: nextCustomerId || undefined,
      templateBody: template.body,
      templateSubject: template.subject ?? undefined,
    });
    setSubject(preview.subject);
    setBody(preview.body);
    setRecipient(preview.recipient);
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <p className="text-sm font-semibold">Compose</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Labelled label="Channel">
            <Select items={channelItems} value={channel} onValueChange={(v) => setChannel((v ?? "sms") as Channel)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {MESSAGE_CHANNEL_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
          <Labelled label="Event">
            <Select items={eventItems} value={eventKey} onValueChange={(v) => setEventKey((v ?? "invoice") as EventKey)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_EVENTS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {MESSAGE_EVENT_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
          <Labelled label="Customer">
            <Select items={customerItems} value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
          <Labelled label={channel === "email" ? "Email address" : "Phone number"}>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={channel === "email" ? "name@example.com" : "9876543210"} />
          </Labelled>
        </div>

        <Button variant="secondary" size="sm" onClick={() => void fillFromTemplate(channel, eventKey, customerId)}>
          Fill from template
        </Button>

        {channel === "email" && (
          <Labelled label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your invoice from {{business_name}}" />
          </Labelled>
        )}

        <Labelled label="Message">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Hi {{customer_name}}, your bill {{doc_number}} for ₹{{total_amount}} is ready."
            className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Labelled>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {process.env.NODE_ENV === "production" ? "" : "Dev mode: messages are written to the in-app outbox, not actually delivered."}
          </p>
          <Button
            disabled={sending || !recipient.trim() || !body.trim()}
            onClick={async () => {
              setSending(true);
              const result = await sendMessage({ channel, eventKey, customerId: customerId || undefined, recipient, subject, body });
              setSending(false);
              if (!result.ok) toast.error(result.error);
              else {
                toast.success("Message sent");
                router.refresh();
              }
            }}
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OutstandingList({ rows }: { rows: OutstandingRow[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold">Customers with an outstanding balance</p>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nobody owes you anything right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.phone ?? "—"}</TableCell>
                    <TableCell>{row.email ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">₹{row.outstanding.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplateEditor({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel>("sms");
  const [eventKey, setEventKey] = React.useState<EventKey>("invoice");
  const [name, setName] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const channelItems = React.useMemo(() => MESSAGE_CHANNELS.map((c) => ({ value: c, label: MESSAGE_CHANNEL_LABELS[c] })), []);
  const eventItems = React.useMemo(() => MESSAGE_EVENTS.map((e) => ({ value: e, label: MESSAGE_EVENT_LABELS[e] })), []);

  function loadExisting(nextChannel: Channel, nextEvent: EventKey) {
    const existing = templates.find((t) => t.channel === nextChannel && t.eventKey === nextEvent);
    setName(existing?.name ?? "");
    setSubject(existing?.subject ?? "");
    setBody(existing?.body ?? "");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 py-4">
          <p className="text-sm font-semibold">Template</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Labelled label="Channel">
              <Select
                items={channelItems}
                value={channel}
                onValueChange={(v) => {
                  const next = (v ?? "sms") as Channel;
                  setChannel(next);
                  loadExisting(next, eventKey);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {MESSAGE_CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>
            <Labelled label="Event">
              <Select
                items={eventItems}
                value={eventKey}
                onValueChange={(v) => {
                  const next = (v ?? "invoice") as EventKey;
                  setEventKey(next);
                  loadExisting(channel, next);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {MESSAGE_EVENT_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>
            <Labelled label="Template name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoice SMS" />
            </Labelled>
          </div>

          {channel === "email" && (
            <Labelled label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Invoice {{doc_number}} from {{business_name}}" />
            </Labelled>
          )}

          <Labelled label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Hi {{customer_name}}, thanks for shopping at {{business_name}}. Bill {{doc_number}}: ₹{{total_amount}}."
            />
          </Labelled>

          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
              <button
                key={placeholder}
                type="button"
                onClick={() => setBody((b) => `${b}{{${placeholder}}}`)}
                className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {`{{${placeholder}}}`}
              </button>
            ))}
          </div>

          <Button
            disabled={saving || !name.trim() || !body.trim()}
            onClick={async () => {
              setSaving(true);
              const result = await saveMessageTemplate({ channel, eventKey, name, subject, body });
              setSaving(false);
              if (!result.ok) toast.error(result.error);
              else {
                toast.success("Template saved");
                router.refresh();
              }
            }}
          >
            {saving ? "Saving…" : "Save template"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Saved templates</p>
          {templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Body</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{MESSAGE_CHANNEL_LABELS[t.channel as Channel] ?? t.channel}</TableCell>
                      <TableCell>{MESSAGE_EVENT_LABELS[t.eventKey as EventKey] ?? t.eventKey}</TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">{t.body}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`Delete template "${t.name}"?`)) return;
                            const result = await deleteMessageTemplate(t.id);
                            if (!result.ok) toast.error(result.error);
                            else {
                              toast.success("Template deleted");
                              router.refresh();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
