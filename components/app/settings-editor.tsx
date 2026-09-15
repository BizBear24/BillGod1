"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Building2, User, Lock, ChevronDown, ChevronUp, Save, DatabaseBackup, Download } from "lucide-react";
import { updateBusiness, updateCompany } from "@/app/actions/org";
import { updateProfile, changePassword } from "@/app/actions/auth";
import { exportAllData } from "@/app/actions/export";
import { getFilesystemService, base64ToBytes } from "@/lib/fs";
import { BUSINESS_TYPES } from "@/lib/validation/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type User = { userId: string; name: string; email: string };
type Business = { id: string; name: string; currency: string };
type Company = {
  id: string; name: string; gstin: string | null; businessType: string | null;
  addressLine1: string | null; city: string | null; state: string | null;
  pincode: string | null; phone: string | null; email: string | null;
};

export function SettingsEditor({
  user,
  business,
  companies,
  canManage,
  canExportAll,
}: {
  user: User;
  business: Business;
  companies: Company[];
  canManage: boolean;
  canExportAll: boolean;
}) {
  return (
    <div className="space-y-6 max-w-2xl">
      <ProfileSection user={user} />
      <PasswordSection />
      {canManage && <BusinessSection business={business} />}
      {canManage && companies.map((c) => <CompanySection key={c.id} company={c} />)}
      {canExportAll && <DataExportSection />}
    </div>
  );
}

/* -------------------------------------------------------------- Data export */

function DataExportSection() {
  const [exporting, setExporting] = React.useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportAllData();
      if (!result.ok || !result.base64) {
        toast.error(result.ok ? "Could not build the export." : result.error);
        return;
      }
      const fileName = `billgod-full-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await getFilesystemService().saveFile(
        fileName,
        base64ToBytes(result.base64),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      toast.success("Export downloaded");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Section icon={DatabaseBackup} title="Export All Data">
      <p className="mb-3 text-sm text-muted-foreground">
        Downloads every product, customer, supplier, sale, purchase and stock movement as one Excel workbook — a full backup you can keep off-platform
        or hand to an accountant.
      </p>
      <Button type="button" variant="secondary" disabled={exporting} onClick={handleExport} className="gap-2">
        <Download className="h-4 w-4" />
        {exporting ? "Building export…" : "Export all data"}
      </Button>
    </Section>
  );
}

/* ------------------------------------------------------------------ Profile */

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
});

function ProfileSection({ user }: { user: User }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name } });

  async function onSubmit(values: z.infer<typeof profileSchema>) {
    const result = await updateProfile(values);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Profile updated");
    router.refresh();
  }

  return (
    <Section icon={User} title="Your Profile">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl><Input placeholder="Your name" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="space-y-1">
            <p className="text-sm font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <SaveButton submitting={form.formState.isSubmitting} />
        </form>
      </Form>
    </Section>
  );
}

/* ---------------------------------------------------------------- Password */

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "At least 8 characters"),
  confirmPassword: z.string().min(1, "Confirm your new password"),
}).refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

function PasswordSection() {
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  async function onSubmit(values: z.infer<typeof passwordSchema>) {
    const result = await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Password changed");
    form.reset();
  }

  return (
    <Section icon={Lock} title="Change Password">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="currentPassword" render={({ field }) => (
            <FormItem>
              <FormLabel>Current Password</FormLabel>
              <FormControl><Input type="password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="newPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm New Password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <SaveButton label="Change Password" submitting={form.formState.isSubmitting} />
        </form>
      </Form>
    </Section>
  );
}

/* ---------------------------------------------------------------- Business */

const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter a business name"),
  currency: z.string().trim().min(1, "Enter a currency code"),
});

function BusinessSection({ business }: { business: Business }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(businessSchema), defaultValues: { name: business.name, currency: business.currency } });

  async function onSubmit(values: z.infer<typeof businessSchema>) {
    const result = await updateBusiness(values);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Business updated");
    router.refresh();
  }

  return (
    <Section icon={Building2} title="Business Details">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Business Name</FormLabel>
              <FormControl><Input placeholder="e.g. Sharma General Store" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="currency" render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <FormControl><Input placeholder="INR" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <SaveButton submitting={form.formState.isSubmitting} />
        </form>
      </Form>
    </Section>
  );
}

/* ----------------------------------------------------------------- Company */

const companySchema = z.object({
  name: z.string().trim().min(2, "Enter a company name"),
  gstin: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
});

function CompanySection({ company }: { company: Company }) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: company.name,
      gstin: company.gstin ?? "",
      businessType: company.businessType ?? "",
      addressLine1: company.addressLine1 ?? "",
      city: company.city ?? "",
      state: company.state ?? "",
      pincode: company.pincode ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
    },
  });

  async function onSubmit(values: z.infer<typeof companySchema>) {
    const result = await updateCompany(company.id, values);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(`${values.name} updated`);
    router.refresh();
  }

  return (
    <Section icon={Building2} title={`Company — ${company.name}`}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Company Name</FormLabel>
                <FormControl><Input placeholder="Legal / trading name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="gstin" render={({ field }) => (
              <FormItem>
                <FormLabel>GSTIN</FormLabel>
                <FormControl><Input placeholder="22AAAAA0000A1Z5" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="businessType" render={({ field }) => (
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
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="addressLine1" render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl><Input placeholder="Shop / building, street" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-3 gap-4">
            <FormField control={form.control} name="city" render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="state" render={({ field }) => (
              <FormItem>
                <FormLabel>State</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="pincode" render={({ field }) => (
              <FormItem>
                <FormLabel>Pincode</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl><Input placeholder="10-digit number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="company@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <SaveButton submitting={form.formState.isSubmitting} />
        </form>
      </Form>
    </Section>
  );
}

/* ----------------------------------------------------------------- Helpers */

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SaveButton({ label = "Save Changes", submitting }: { label?: string; submitting: boolean }) {
  return (
    <Button type="submit" disabled={submitting} className="gap-2">
      <Save className="h-4 w-4" />
      {submitting ? "Saving…" : label}
    </Button>
  );
}
