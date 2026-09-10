"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your business, companies, branches and team.</p>
      </div>
      <div className="flex gap-6 border-b border-border">
        <SettingsTab href="/settings/company" label="Company & Branches" active={pathname.startsWith("/settings/company")} />
        <SettingsTab href="/settings/users" label="Team & Roles" active={pathname.startsWith("/settings/users")} />
      </div>
      {children}
    </div>
  );
}

function SettingsTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`pb-3 text-sm font-medium ${
        active ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
