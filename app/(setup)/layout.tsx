import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { TestingAutoLogin } from "@/components/app/testing-auto-login";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    if (process.env.SKIP_AUTH === "true") return <TestingAutoLogin />;
    redirect("/sign-in?next=/setup");
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex max-w-2xl items-center gap-2 pb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">B</div>
        <span className="text-2xl font-bold tracking-tight">BillGod Setup</span>
      </div>
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}
