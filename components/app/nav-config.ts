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

export type NavItem = {
  href: string;
  labelKey: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/billing", labelKey: "nav.billing", label: "Billing / Sales", icon: Receipt },
  { href: "/purchase", labelKey: "nav.purchase", label: "Purchase", icon: Package },
  { href: "/inventory", labelKey: "nav.inventory", label: "Inventory", icon: Boxes },
  { href: "/masters", labelKey: "nav.masters", label: "Masters", icon: Layers },
  { href: "/customers", labelKey: "nav.customers", label: "Customers", icon: Users },
  { href: "/suppliers", labelKey: "nav.suppliers", label: "Suppliers", icon: Truck },
  { href: "/accounting", labelKey: "nav.accounting", label: "Accounting", icon: Calculator },
  { href: "/reports", labelKey: "nav.reports", label: "Reports", icon: BarChart3 },
  { href: "/barcodes", labelKey: "nav.barcodes", label: "Barcodes", icon: Barcode },
  { href: "/loyalty", labelKey: "nav.loyalty", label: "Loyalty", icon: Gift },
  { href: "/communications", labelKey: "nav.communications", label: "Communications", icon: MessageSquare },
  { href: "/settings", labelKey: "nav.settings", label: "Settings", icon: Settings },
];
