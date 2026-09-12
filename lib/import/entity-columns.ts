import { normaliseHeading, parseBoolean, parseNumber, parseText } from "./product-columns";

/**
 * Generic column-mapping machinery, factored out of `product-columns.ts` so
 * every bulk-importable entity (suppliers, customers, the simple masters)
 * can share the same loose-heading matching instead of each hand-rolling it.
 */

export { parseBoolean, parseNumber, parseText, normaliseHeading };

export type ColumnKind = "text" | "number";

export type ColumnSpec<K extends string> = {
  key: K;
  /** The heading written into the downloadable template. */
  heading: string;
  aliases: string[];
  required?: boolean;
  kind: ColumnKind;
  note?: string;
};

export type ColumnMapping<K extends string> = {
  /** Column index in the sheet for each recognised field. */
  byKey: Partial<Record<K, number>>;
  unknownHeadings: string[];
  missingRequired: K[];
};

export function mapGenericColumns<K extends string>(headers: string[], columns: ColumnSpec<K>[]): ColumnMapping<K> {
  const lookup = new Map<string, K>();
  for (const column of columns) {
    lookup.set(normaliseHeading(column.heading), column.key);
    lookup.set(normaliseHeading(column.key), column.key);
    for (const alias of column.aliases) lookup.set(normaliseHeading(alias), column.key);
  }

  const byKey: Partial<Record<K, number>> = {};
  const unknownHeadings: string[] = [];

  headers.forEach((heading, index) => {
    if (!heading.trim()) return;
    const key = lookup.get(normaliseHeading(heading));
    if (key && byKey[key] === undefined) byKey[key] = index;
    else if (!key) unknownHeadings.push(heading);
  });

  const missingRequired = columns.filter((c) => c.required && byKey[c.key] === undefined).map((c) => c.key);
  return { byKey, unknownHeadings, missingRequired };
}
