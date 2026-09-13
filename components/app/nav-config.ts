import {
  LayoutDashboard,
  Receipt,
  Package,
  Boxes,
  Layers,
  Users,
  Truck,
  Calculator,
  BarChart3,
  Barcode,
  Gift,
  MessageSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  labelKey: string;
  label: string;
  icon: LucideIcon;
  accent: string; // Tailwind text-color class for the icon
  /** Hidden from the sidebar for a role that lacks this — a cashier never even sees "Purchase". Omit for pages every role may open. */
  permission?: PermissionKey;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",      labelKey: "nav.dashboard",      label: "Dashboard",      icon: LayoutDashboard, accent: "text-violet-500" },
  { href: "/billing",        labelKey: "nav.billing",        label: "Billing / Sales", icon: Receipt,         accent: "text-emerald-500", permission: PERMISSIONS.BILLING_VIEW },
  { href: "/purchase",       labelKey: "nav.purchase",       label: "Purchase",       icon: Package,         accent: "text-sky-500",     permission: PERMISSIONS.PURCHASE_VIEW },
  { href: "/inventory",      labelKey: "nav.inventory",      label: "Inventory",      icon: Boxes,           accent: "text-amber-500",   permission: PERMISSIONS.INVENTORY_VIEW },
  { href: "/masters",        labelKey: "nav.masters",        label: "Masters",        icon: Layers,          accent: "text-rose-500",    permission: PERMISSIONS.MASTERS_VIEW },
  { href: "/customers",      labelKey: "nav.customers",      label: "Customers",      icon: Users,           accent: "text-cyan-500",    permission: PERMISSIONS.CUSTOMERS_VIEW },
  { href: "/suppliers",      labelKey: "nav.suppliers",      label: "Suppliers",      icon: Truck,           accent: "text-orange-500",  permission: PERMISSIONS.SUPPLIERS_VIEW },
  { href: "/accounting",     labelKey: "nav.accounting",     label: "Accounting",     icon: Calculator,      accent: "text-teal-500",    permission: PERMISSIONS.ACCOUNTS_VIEW },
  { href: "/reports",        labelKey: "nav.reports",        label: "Reports",        icon: BarChart3,       accent: "text-indigo-500",  permission: PERMISSIONS.REPORTS_VIEW },
  { href: "/barcodes",       labelKey: "nav.barcodes",       label: "Barcodes",       icon: Barcode,         accent: "text-pink-500",    permission: PERMISSIONS.PRODUCTS_VIEW },
  { href: "/loyalty",        labelKey: "nav.loyalty",        label: "Loyalty",        icon: Gift,            accent: "text-fuchsia-500" },
  { href: "/communications", labelKey: "nav.communications", label: "Communications", icon: MessageSquare,   accent: "text-lime-500" },
  // Every role can reach Settings for their own profile/password even without SETTINGS_VIEW; company/team management inside is gated per-section.
  { href: "/settings",       labelKey: "nav.settings",       label: "Settings",       icon: Settings,        accent: "text-slate-400" },
];
