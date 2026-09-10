import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function RootPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect("/sign-in");
  }
  redirect(sessionUser.activeBusinessId ? "/dashboard" : "/setup");
}
