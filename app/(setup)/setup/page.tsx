"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Circle, FileText, Printer, Upload } from "lucide-react";
import { createBusinessSchema, createCompanySchema, createBranchSchema, BUSINESS_TYPES, type CreateBusinessInput, type CreateCompanyInput, type CreateBranchInput } from "@/lib/validation/org";
import { createBusiness, createCompany, createBranch, completeSetup } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STEPS = ["Business", "Company & GST", "Branch", "Ready"] as const;

export default function SetupWizardPage() {
  const [step, setStep] = useState(0);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-8">
      <Stepper current={step} />
      {step === 0 && <BusinessStep onDone={() => setStep(1)} />}
      {step === 1 && <CompanyStep onDone={(id) => { setCompanyId(id); setStep(2); }} />}
      {step === 2 && companyId && <BranchStep companyId={companyId} onDone={() => setStep(3)} />}
      {step === 3 && (
        <ReadyStep
          onFinish={async () => {
            await completeSetup();
            router.push("/dashboard");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-2">
            {i < current ? (
              <CheckCircle2 className="h-8 w-8 text-primary" />
            ) : (
              <Circle className={i === current ? "h-8 w-8 text-primary" : "h-8 w-8 text-muted-foreground"} />
            )}
            <span className={`text-xs font-medium ${i === current ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className="mx-2 h-0.5 flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function BusinessStep({ onDone }: { onDone: () => void }) {
  const form = useForm<CreateBusinessInput>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: { businessName: "", currency: "INR" },
  });

  async function onSubmit(values: CreateBusinessInput) {
    const result = await createBusiness(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">What&apos;s your business called?</CardTitle>
        <CardDescription>This is the top-level account everything else lives under.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="businessName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Sharma General Store" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Continue"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function CompanyStep({ onDone }: { onDone: (companyId: string) => void }) {
  const form = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", gstin: "", businessType: "", addressLine1: "", city: "", state: "", pincode: "", phone: "" },
  });

  async function onSubmit(values: CreateCompanyInput) {
    const result = await createCompany(values);
    if (!result.ok || !result.companyId) {
      form.setError("root", { message: !result.ok ? result.error : "Something went wrong." });
      return;
    }
    onDone(result.companyId);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Company & GST details</CardTitle>
        <CardDescription>Used on your invoices and GST reports. You can add more companies later.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Legal / trading name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="gstin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GSTIN</FormLabel>
                    <FormControl>
                      <Input placeholder="22AAAAA0000A1Z5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Shop / building, street" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pincode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pincode</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="10-digit mobile number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Continue"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function BranchStep({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const form = useForm<CreateBranchInput>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: { companyId, name: "Main Branch", addressLine1: "", city: "", state: "", pincode: "", phone: "" },
  });

  async function onSubmit(values: CreateBranchInput) {
    const result = await createBranch(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Your first branch</CardTitle>
        <CardDescription>A default warehouse and billing counter will be created automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Continue"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ReadyStep({ onFinish }: { onFinish: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CheckCircle2 className="mb-2 h-14 w-14 text-primary" />
        <CardTitle className="text-2xl">You&apos;re ready to bill</CardTitle>
        <CardDescription>Your shop is set up. Here&apos;s where to go next.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <UpcomingRow icon={FileText} label="Add your products" phase="Masters → Products" ready />
        <UpcomingRow icon={Printer} label="Print barcode labels and invoices (A4 / A5 / 58mm / 80mm)" phase="Barcodes &amp; Printing" ready />
        <UpcomingRow icon={Upload} label="Import products from Excel or CSV" phase="Masters → Products → Import" ready />
        <Button
          size="lg"
          className="w-full"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            await onFinish();
          }}
        >
          {submitting ? "Finishing..." : "Go to Dashboard"}
        </Button>
      </CardContent>
    </Card>
  );
}

function UpcomingRow({ icon: Icon, label, phase, ready }: { icon: typeof FileText; label: string; phase: string; ready?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <Icon className={`h-5 w-5 shrink-0 ${ready ? "text-primary" : "text-muted-foreground"}`} />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{ready ? phase : `Available once the ${phase} ships`}</p>
      </div>
    </div>
  );
}
