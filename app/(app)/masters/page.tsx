import Link from "next/link";
import { Tag, Layers3, Award, Ruler, Palette, Warehouse, UserSquare2, Stethoscope, Receipt, Package } from "lucide-react";

const MASTER_LINKS = [
  { href: "/masters/products", label: "Products", description: "Item catalog with prices, stock and variants", icon: Package },
  { href: "/masters/categories", label: "Categories", description: "Top-level product groupings", icon: Tag },
  { href: "/masters/sections", label: "Sections", description: "Sections and subsections within a category", icon: Layers3 },
  { href: "/masters/brands", label: "Brands", description: "Manufacturer / brand names", icon: Award },
  { href: "/masters/units", label: "Units (UOM)", description: "Piece, Kg, Litre and their short codes", icon: Ruler },
  { href: "/masters/sizes", label: "Sizes", description: "Size lookup for apparel & footwear", icon: Ruler },
  { href: "/masters/colors", label: "Colors", description: "Color lookup with hex swatches", icon: Palette },
  { href: "/masters/racks", label: "Racks", description: "Storage rack / bin locations per warehouse", icon: Warehouse },
  { href: "/masters/salespersons", label: "Salespersons", description: "Sales staff for billing attribution", icon: UserSquare2 },
  { href: "/masters/doctors", label: "Doctors", description: "Referring doctors (optical / pharma)", icon: Stethoscope },
  { href: "/masters/hsn", label: "HSN / Tax Rates", description: "HSN codes and GST rate presets", icon: Receipt },
];

export default function MastersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Masters</h1>
        <p className="text-muted-foreground">Manage the lookup data your products, bills and purchases are built on.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MASTER_LINKS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <m.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
