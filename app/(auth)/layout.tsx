import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    redirect(sessionUser.activeBusinessId ? "/dashboard" : "/setup");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">B</div>
        <span className="text-2xl font-bold tracking-tight">BillGod</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
