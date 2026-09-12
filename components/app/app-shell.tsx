"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronsUpDown, LogOut } from "lucide-react";
import { NAV_ITEMS } from "./nav-config";
import { useT } from "@/lib/i18n/context";
import { signOut } from "@/app/actions/auth";
import { switchBusiness } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";

type Business = { businessId: string; businessName: string; role: Role };

export function AppShell({
  user,
  activeBusiness,
  businesses,
  children,
}: {
  user: { name: string; email: string };
  activeBusiness: Business;
  businesses: Business[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex w-72 flex-col bg-sidebar">
            <div className="flex justify-end p-3">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-4 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>

          <BusinessSwitcher activeBusiness={activeBusiness} businesses={businesses} />

          <UserMenu user={user} role={activeBusiness.role} />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <>
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">B</div>
        <span className="text-xl font-bold tracking-tight text-sidebar-foreground">{t("app.name")}</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-[0.9375rem] font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function BusinessSwitcher({ activeBusiness, businesses }: { activeBusiness: Business; businesses: Business[] }) {
  const router = useRouter();

  if (businesses.length <= 1) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{activeBusiness.businessName}</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[activeBusiness.role]}</p>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold">{activeBusiness.businessName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[activeBusiness.role]}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch business</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {businesses.map((b) => (
          <DropdownMenuItem
            key={b.businessId}
            onClick={async () => {
              if (b.businessId === activeBusiness.businessId) return;
              await switchBusiness(b.businessId);
              router.push("/dashboard");
              router.refresh();
            }}
          >
            {b.businessName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user, role }: { user: { name: string; email: string }; role: Role }) {
  const router = useRouter();
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="font-medium">{user.name}</p>
            <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
            <p className="text-xs font-normal text-muted-foreground">{ROLE_LABELS[role]}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
