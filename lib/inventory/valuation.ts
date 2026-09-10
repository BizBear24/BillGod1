/**
 * Per-batch stock costing, derived from the movement ledger.
 *
 * Valuing stock at the product master's *current* purchase price is wrong the
 * moment a supplier changes their price: 10 shirts bought at ₹400 and 10 more
 * at ₹500 are worth ₹9,000, not 20 × whatever the master happens to say today.
 *
 * So this replays the movements in order and keeps FIFO cost layers per
 * product *and* warehouse — first goods in are the first goods out, which is
 * both what actually happens on a shop shelf and what Indian GAAP expects.
 * Nothing is stored: the layers are rebuilt from the ledger every time, so
 * they cannot drift from the events that produced them.
 */

import { round2 } from "@/lib/sales/totals";

export type ValuationMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  /** Signed: positive brought stock in, negative took it out. */
  quantity: string;
  unitCost: string | null;
  batchNumber: string | null;
  createdAt: Date;
  /** Decides whether a movement is a sale (and so touches COGS) or just stock. */
  type: MovementType;
  /** The document behind it — how a cancellation finds the movement it undoes. */
  referenceId: string;
};

export type MovementType =
  | "purchase_in"
  | "purchase_return_out"
  | "sale_out"
  | "sale_return_in"
  | "transfer_in"
  | "transfer_out"
  | "adjustment_in"
  | "adjustment_out"
  | "cancel_in"
  | "cancel_out";

export type CostLayer = {
  batchNumber: string | null;
  quantity: number;
  unitCost: number;
};

export type ProductValuation = {
  productId: string;
  quantity: number;
  /** Closing value, each remaining layer at the cost it actually came in at. */
  value: number;
  /** value ÷ quantity — what the remaining stock averages out to. */
  averageCost: number;
  /** What everything that went out cost, i.e. cost of goods sold. */
  cogs: number;
  layers: CostLayer[];
  /**
   * How much stock is currently negative — billed out with nothing on hand and
   * not yet covered by a purchase. Worth surfacing, because until the matching
   * purchase is entered its cost is a guess.
   */
  shortStockQuantity: number;
};

const EPSILON = 0.0005;

/**
 * Which movement types are a sale leaving the shop, and so belong in cost of
 * goods sold. A transfer between warehouses, a purchase return going back to
 * the supplier and a write-off all move stock without being a sale — counting
 * them as COGS would quietly wreck the margin.
 *
 * A damaged-goods adjustment is a real loss, but it is a write-off rather than
 * cost of goods *sold*, so it stays out of gross profit and belongs in the
 * books instead.
 */
const SALE_OUT_TYPES = new Set<MovementType>(["sale_out"]);
const SALE_IN_TYPES = new Set<MovementType>(["sale_return_in"]);

/**
 * Replays one product+warehouse's movements into FIFO layers, tracking cost of
 * goods sold as it goes.
 *
 * Three cases need care:
 *
 * - Stock coming *in* without a price — a customer return, a transfer, a
 *   positive adjustment — is valued at what the stock already on hand
 *   averages, falling back to the product's list purchase price when there is
 *   nothing on hand to average.
 *
 * - Stock going *out* with nothing left to draw from — sold before the
 *   purchase was entered — is costed at the fallback price and remembered as a
 *   shortfall. When the purchase finally arrives it repays that shortfall
 *   first, and the difference between the guess and the real cost is put
 *   through to COGS, so the books settle up rather than staying wrong.
 *
 * - A cancellation has to undo the *cost* its document booked, not just the
 *   stock it moved. The reversing movements carry the same `referenceId` as
 *   the originals, so what each document actually cost is remembered and
 *   unwound at exactly that figure. Without this a voided sale would drop out
 *   of revenue while its cost stayed in, and every margin would be wrong.
 */
function replay(movements: ValuationMovement[], fallbackCost: number) {
  const layers: CostLayer[] = [];
  let cogs = 0;
  /** Units sold that no receipt has covered yet. Never negative. */
  let shortfall = 0;
  /** What each document put through COGS, so a cancellation can take it back out. */
  const bookedByReference = new Map<string, { quantity: number; cost: number }>();

  const currentAverage = () => {
    const quantity = layers.reduce((s, l) => s + l.quantity, 0);
    if (quantity <= EPSILON) return fallbackCost;
    return layers.reduce((s, l) => s + l.quantity * l.unitCost, 0) / quantity;
  };

  const book = (referenceId: string, quantity: number, cost: number) => {
    const current = bookedByReference.get(referenceId) ?? { quantity: 0, cost: 0 };
    current.quantity += quantity;
    current.cost += cost;
    bookedByReference.set(referenceId, current);
  };

  /** Unwinds part of what a document booked, pro-rata to the quantity reversed. */
  const unbook = (referenceId: string, quantity: number): number => {
    const booked = bookedByReference.get(referenceId);
    if (!booked || Math.abs(booked.quantity) < EPSILON) return 0;
    const share = Math.min(1, quantity / Math.abs(booked.quantity));
    const cost = booked.cost * share;
    booked.quantity -= Math.sign(booked.quantity) * Math.min(quantity, Math.abs(booked.quantity));
    booked.cost -= cost;
    return cost;
  };

  /** Draws `wanted` units off the front of the FIFO layers, reporting what they cost. */
  const consume = (wanted: number): { cost: number; short: number } => {
    let remaining = wanted;
    let cost = 0;
    while (remaining > EPSILON && layers.length > 0) {
      const layer = layers[0];
      const taken = Math.min(layer.quantity, remaining);
      cost += taken * layer.unitCost;
      layer.quantity -= taken;
      remaining -= taken;
      if (layer.quantity <= EPSILON) layers.shift();
    }
    return { cost, short: remaining > EPSILON ? remaining : 0 };
  };

  for (const movement of movements) {
    const quantity = parseFloat(movement.quantity);
    if (!Number.isFinite(quantity) || Math.abs(quantity) < EPSILON) continue;

    /* ---------------------------------------------------------- stock in */
    if (quantity > 0) {
      // Undoing a sale: the units go back on the shelf at what they were
      // costed at on the way out, and that cost leaves COGS again.
      if (movement.type === "cancel_in") {
        const reversedCost = unbook(movement.referenceId, quantity);
        const unitCost = reversedCost > 0 ? reversedCost / quantity : currentAverage();
        cogs -= reversedCost;
        layers.unshift({ batchNumber: movement.batchNumber, quantity, unitCost });
        continue;
      }

      const stated = movement.unitCost === null ? null : parseFloat(movement.unitCost);
      const unitCost = stated !== null && Number.isFinite(stated) && stated > 0 ? stated : currentAverage();

      let incoming = quantity;
      if (shortfall > EPSILON) {
        const covered = Math.min(shortfall, incoming);
        // These units were already expensed at the fallback price; true it up.
        cogs += covered * (unitCost - fallbackCost);
        shortfall -= covered;
        incoming -= covered;
      }
      if (incoming > EPSILON) layers.push({ batchNumber: movement.batchNumber, quantity: incoming, unitCost });

      // Goods handed back by a customer are goods no longer sold.
      if (SALE_IN_TYPES.has(movement.type)) {
        const returnedCost = quantity * unitCost;
        cogs -= returnedCost;
        book(movement.referenceId, -quantity, -returnedCost);
      }
      continue;
    }

    /* --------------------------------------------------------- stock out */
    const wanted = -quantity;

    // Undoing a customer return: the units leave again and the cost that
    // return took out of COGS goes straight back in. A cancelled *purchase*
    // has nothing booked, so nothing is restored.
    if (movement.type === "cancel_out") {
      consume(wanted);
      cogs -= unbook(movement.referenceId, wanted);
      continue;
    }

    const { cost, short } = consume(wanted);
    let outCost = cost;
    if (short > 0) {
      outCost += short * fallbackCost;
      shortfall += short;
    }

    if (SALE_OUT_TYPES.has(movement.type)) {
      cogs += outCost;
      book(movement.referenceId, wanted, outCost);
    }
  }

  return { layers, cogs, shortfall, fallbackCost };
}

/**
 * Values every product's stock from its movements.
 *
 * `fallbackCostByProduct` is the product master's purchase price, used only
 * where the ledger cannot say what something cost.
 */
export function valueStock(
  movements: ValuationMovement[],
  fallbackCostByProduct: Map<string, number>
): Map<string, ProductValuation> {
  const byLocation = new Map<string, { productId: string; movements: ValuationMovement[] }>();
  for (const movement of movements) {
    const key = `${movement.productId} ${movement.warehouseId}`;
    const bucket = byLocation.get(key);
    if (bucket) bucket.movements.push(movement);
    else byLocation.set(key, { productId: movement.productId, movements: [movement] });
  }

  const result = new Map<string, ProductValuation>();

  for (const { productId, movements: bucket } of byLocation.values()) {
    const fallbackCost = fallbackCostByProduct.get(productId) ?? 0;

    // Ledger order, with the id breaking ties so two movements written in the
    // same transaction always replay the same way.
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

    const { layers, cogs, shortfall } = replay(bucket, fallbackCost);

    const existing = result.get(productId) ?? {
      productId,
      quantity: 0,
      value: 0,
      averageCost: 0,
      cogs: 0,
      layers: [],
      shortStockQuantity: 0,
    };

    for (const layer of layers) {
      existing.quantity += layer.quantity;
      existing.value += layer.quantity * layer.unitCost;
      existing.layers.push(layer);
    }
    // Negative stock is real stock the shop owes, so it counts against both
    // the quantity and the value rather than being quietly dropped.
    if (shortfall > EPSILON) {
      existing.quantity -= shortfall;
      existing.value -= shortfall * fallbackCost;
      existing.layers.push({ batchNumber: null, quantity: -shortfall, unitCost: fallbackCost });
      existing.shortStockQuantity += shortfall;
    }
    existing.cogs += cogs;
    result.set(productId, existing);
  }

  for (const valuation of result.values()) {
    valuation.quantity = round2(valuation.quantity);
    valuation.value = round2(valuation.value);
    valuation.cogs = round2(valuation.cogs);
    valuation.shortStockQuantity = round2(valuation.shortStockQuantity);
    valuation.averageCost = Math.abs(valuation.quantity) > EPSILON ? round2(valuation.value / valuation.quantity) : 0;

    // Merge layers that share a batch and a cost so the batch view stays short.
    const merged = new Map<string, CostLayer>();
    for (const layer of valuation.layers) {
      const key = `${layer.batchNumber ?? ""} ${layer.unitCost}`;
      const current = merged.get(key);
      if (current) current.quantity = round2(current.quantity + layer.quantity);
      else merged.set(key, { ...layer, quantity: round2(layer.quantity) });
    }
    valuation.layers = [...merged.values()].filter((l) => Math.abs(l.quantity) > EPSILON);
  }

  return result;
}
