import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { TestingAutoLogin } from "@/components/app/testing-auto-login";

export default async function RootPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    if (process.env.SKIP_AUTH === "true") return <TestingAutoLogin />;
    redirect("/sign-in");
  }
  redirect(sessionUser.activeBusinessId ? "/dashboard" : "/setup");
}
