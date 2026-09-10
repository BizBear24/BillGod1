import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData } from "@/app/actions/masters";
import { SectionsManager } from "@/components/app/sections-manager";

export default async function SectionsPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Sections</h1>
      </div>
      <SectionsManager sections={data.sections} subsections={data.subsections} canManage={data.canManage} />
    </div>
  );
}
