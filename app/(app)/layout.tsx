import { redirect } from "next/navigation";
import { getSessionUser, getActiveMembership, listMemberships } from "@/lib/auth/session";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect("/sign-in");
  }

  const activeMembership = await getActiveMembership(sessionUser);
  if (!activeMembership) {
    redirect("/setup");
  }

  const businesses = await listMemberships(sessionUser.userId);

  return (
    <AppShell user={{ name: sessionUser.name, email: sessionUser.email }} activeBusiness={activeMembership} businesses={businesses}>
      {children}
    </AppShell>
  );
}
