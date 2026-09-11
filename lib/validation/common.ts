import { z } from "zod";

/**
 * Shared validators for fields that are allowed to be empty.
 *
 * A nullable database column reads back as `null`, an untouched text input
 * submits `""`, and an unselected dropdown submits the `"none"` sentinel — but
 * `z.string().optional()` accepts none of those, only `undefined`. That is why
 * re-saving a record with any blank optional field used to fail with
 * "expected string, received null".
 *
 * These helpers normalise all four spellings of "nothing" to `undefined`
 * before validating, so a value can round-trip from the database into a form
 * and back without the shape of "empty" mattering.
 */

/** The `"none"` item a Select shows for "no value chosen". */
export const NONE = "none";

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/** Optional free text. Blank, whitespace-only and null all become undefined. */
export const optionalText = z.preprocess(
  (value) => (isBlank(value) ? undefined : value),
  z.string().trim().optional()
);

/** Optional foreign key from a Select, which also spells "empty" as "none". */
export const optionalId = z.preprocess(
  (value) => (isBlank(value) || value === NONE ? undefined : value),
  z.string().optional()
);

/**
 * Optional number, wrapping whatever numeric rules the caller needs.
 * Text inputs hand back strings, so coercion stays the caller's business —
 * this only decides what counts as "not given".
 */
export function optionalNumber<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (isBlank(value) ? undefined : value), schema.optional());
}

/** Optional yes/no, for checkboxes that may arrive as null from the database. */
export const optionalBoolean = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.boolean().optional()
);

/** Optional `YYYY-MM-DD` date text, as a date input or a blank column gives it. */
export const optionalDateText = z.preprocess(
  (value) => (isBlank(value) ? undefined : value),
  z.string().trim().optional()
);
