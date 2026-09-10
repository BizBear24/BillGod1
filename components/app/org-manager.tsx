"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Building2, GitBranch, Plus, Monitor, Warehouse as WarehouseIcon, Pencil, Trash2 } from "lucide-react";
import { createCompanySchema, createBranchSchema, BUSINESS_TYPES, type CreateCompanyInput, type CreateBranchInput } from "@/lib/validation/org";
import { createCompany, createBranch, createCounter, renameCounter, deleteCounter } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type Company = { id: string; name: string; gstin: string | null; city: string | null; state: string | null };
type Branch = { id: string; companyId: string; name: string; city: string | null };
type Warehouse = { id: string; branchId: string; name: string };
type Counter = { id: string; branchId: string; name: string };

export function OrgManager({
  companies,
  branches,
  warehouses,
  counters,
  canManageCompany,
  canManageBranch,
}: {
  companies: Company[];
  branches: Branch[];
  warehouses: Warehouse[];
  counters: Counter[];
  canManageCompany: boolean;
  canManageBranch: boolean;
}) {
  const [addCompanyOpen, setAddCompanyOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Companies & Branches</h2>
        {canManageCompany && (
          <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
            <DialogTrigger render={<Button size="lg" />}>
              <Plus className="h-4 w-4" />
              + Add Company
            </DialogTrigger>
            <DialogContent>
              <AddCompanyForm onSuccess={() => setAddCompanyOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {companies.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No companies yet.</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {companies.map((company) => (
          <Card key={company.id}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{company.name}</CardTitle>
              </div>
              {company.gstin && <p className="text-xs text-muted-foreground">GSTIN: {company.gstin}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              {branches
                .filter((b) => b.companyId === company.id)
                .map((branch) => (
                  <div key={branch.id} className="space-y-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      {branch.name}
                      {branch.city && <Badge variant="secondary">{branch.city}</Badge>}
                    </div>
                    {warehouses
                      .filter((w) => w.branchId === branch.id)
                      .map((w) => (
                        <div key={w.id} className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                          <WarehouseIcon className="h-3.5 w-3.5" />
                          {w.name}
                        </div>
                      ))}
                    {counters
                      .filter((c) => c.branchId === branch.id)
                      .map((counter) => (
                        <CounterRow key={counter.id} counter={counter} canManage={canManageBranch} />
                      ))}
                    {canManageBranch && <AddCounterDialog branchId={branch.id} />}
                  </div>
                ))}
              {canManageBranch && <AddBranchDialog companyId={company.id} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AddCompanyForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const form = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", gstin: "", businessType: "", addressLine1: "", city: "", state: "", pincode: "", phone: "" },
  });

  async function onSubmit(values: CreateCompanyInput) {
    const result = await createCompany(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Company created");
    form.reset();
    onSuccess();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a company</DialogTitle>
        <DialogDescription>Each company has its own GSTIN and invoices.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company Name</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                    <Input {...field} />
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
          {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Create Company"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function AddBranchDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const form = useForm<CreateBranchInput>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: { companyId, name: "", addressLine1: "", city: "", state: "", pincode: "", phone: "" },
  });

  async function onSubmit(values: CreateBranchInput) {
    const result = await createBranch(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Branch created");
    form.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="w-full" />}>
        <Plus className="h-3.5 w-3.5" />
        Add Branch
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a branch</DialogTitle>
          <DialogDescription>A default warehouse and counter will be created automatically.</DialogDescription>
        </DialogHeader>
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
            <DialogFooter>
              <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Create Branch"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


/** One billing counter, renameable in place and removable while unused. */
function CounterRow({ counter, canManage }: { counter: Counter; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(counter.name);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const result = await renameCounter(counter.id, name);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteCounter(counter.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Counter removed");
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 pl-6">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        <Button size="sm" disabled={busy} onClick={save}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setName(counter.name);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
      <Monitor className="h-3.5 w-3.5" />
      <span className="flex-1">{counter.name}</span>
      {canManage && (
        <>
          <Button size="icon" variant="ghost" aria-label="Rename counter" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Remove counter" disabled={busy} onClick={remove}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </>
      )}
    </div>
  );
}

function AddCounterDialog({ branchId }: { branchId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const result = await createCounter({ branchId, name });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Counter added");
    setName("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="ml-6" />}>
        <Plus className="h-3 w-3" />
        Add Counter
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a billing counter</DialogTitle>
          <DialogDescription>Bills record which counter rang them up, which is what the counter-wise report groups by.</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Counter 2" />
        <DialogFooter>
          <Button disabled={busy || name.trim().length === 0} onClick={submit}>
            {busy ? "Adding..." : "Add Counter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
