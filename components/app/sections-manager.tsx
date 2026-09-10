"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Layers3, Plus, Trash2 } from "lucide-react";
import { sectionSchema, subsectionSchema, type SubsectionInput } from "@/lib/validation/masters";
import { createSection, deleteSection, createSubsection, deleteSubsection } from "@/app/actions/masters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type Section = { id: string; name: string };
type Subsection = { id: string; sectionId: string; name: string };

export function SectionsManager({
  sections,
  subsections,
  canManage,
}: {
  sections: Section[];
  subsections: Subsection[];
  canManage: boolean;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sections</h2>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="h-4 w-4" />
              Add Section
            </DialogTrigger>
            <DialogContent>
              <AddSectionForm onSuccess={() => setAddOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {sections.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No sections yet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{section.name}</CardTitle>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete section"
                      onClick={async () => {
                        if (!confirm(`Delete section "${section.name}"? This also deletes its subsections.`)) return;
                        const result = await deleteSection(section.id);
                        if (!result.ok) toast.error(result.error);
                        else {
                          toast.success("Section deleted");
                          router.refresh();
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {subsections
                    .filter((s) => s.sectionId === section.id)
                    .map((sub) => (
                      <Badge key={sub.id} variant="secondary" className="gap-1.5">
                        {sub.name}
                        {canManage && (
                          <button
                            type="button"
                            aria-label={`Delete ${sub.name}`}
                            onClick={async () => {
                              if (!confirm(`Delete subsection "${sub.name}"?`)) return;
                              const result = await deleteSubsection(sub.id);
                              if (!result.ok) toast.error(result.error);
                              else {
                                toast.success("Subsection deleted");
                                router.refresh();
                              }
                            }}
                            className="ml-0.5 text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                  {subsections.filter((s) => s.sectionId === section.id).length === 0 && (
                    <p className="text-xs text-muted-foreground">No subsections yet.</p>
                  )}
                </div>
                {canManage && <AddSubsectionDialog sectionId={section.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddSectionForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(sectionSchema), defaultValues: { name: "" } });

  async function onSubmit(values: { name: string }) {
    const result = await createSection(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Section created");
    form.reset();
    onSuccess();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a section</DialogTitle>
        <DialogDescription>Sections group products; each can have its own subsections.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. Men's Wear" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Create Section"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function AddSubsectionDialog({ sectionId }: { sectionId: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const form = useForm<SubsectionInput>({ resolver: zodResolver(subsectionSchema), defaultValues: { sectionId, name: "" } });

  async function onSubmit(values: SubsectionInput) {
    const result = await createSubsection(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Subsection created");
    form.reset({ sectionId, name: "" });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="w-full" />}>
        <Plus className="h-3.5 w-3.5" />
        Add Subsection
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a subsection</DialogTitle>
          <DialogDescription className="sr-only">Subsection form</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
