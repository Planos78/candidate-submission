import {
  CarrierSelectionInput,
  CarrierRecommendation,
  CarrierOption,
} from "./types";

function estimateCost(carrier: CarrierOption, weight_kg: number): number {
  return Math.round(
    carrier.base_cost_thb + carrier.cost_per_kg_thb * weight_kg
  );
}

function getDaysUntilDeadline(deadline: string): number {
  const now = new Date();
  const due = new Date(deadline);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Rule-based fallback carrier selection.
 * Used when AI is unavailable or returns an invalid response.
 *
 * Strategy:
 * 1. Filter ineligible carriers (weight, COD, province)
 * 2. Filter carriers that can meet SLA deadline
 * 3. If fragile: sort by lowest historical damage rate, then cost
 * 4. Otherwise: sort by on_time_rate desc, then cost asc
 * 5. If no perf data: sort by cost asc
 */
export function fallbackCarrierSelection(
  input: CarrierSelectionInput
): CarrierRecommendation {
  const { order, available_carriers, historical_performance } = input;
  const daysUntil = getDaysUntilDeadline(order.required_delivery_by);

  // Step 1: filter eligible carriers
  const eligible = available_carriers.filter((c) => {
    if (c.max_weight_kg < order.weight_kg) return false;
    if (order.requires_cod && !c.supports_cod) return false;
    if (
      c.supported_provinces.length > 0 &&
      !c.supported_provinces.includes(order.destination.province)
    )
      return false;
    return true;
  });

  if (eligible.length === 0) {
    throw new Error("No eligible carriers found for this order");
  }

  // Step 2: prefer carriers that can meet SLA
  const canMeetSLA = eligible.filter((c) => c.estimated_days_max <= daysUntil);
  const candidates = canMeetSLA.length > 0 ? canMeetSLA : eligible;

  // Step 3 & 4: score carriers
  const scored = candidates.map((c) => {
    const perf = historical_performance.find(
      (p) =>
        p.carrier_id === c.id &&
        p.province === order.destination.province
    );
    const cost = estimateCost(c, order.weight_kg);
    const damageRate = perf?.damage_rate ?? 0.02;
    const onTimeRate = perf?.on_time_rate ?? 0.85;

    // Composite score: higher is better
    let score = onTimeRate * 100 - damageRate * 200 - cost * 0.1;
    if (order.fragile) {
      score = -damageRate * 500 + onTimeRate * 50 - cost * 0.05;
    }
    if (order.declared_value_thb < 500) {
      score = -cost + onTimeRate * 30;
    }

    return { carrier: c, cost, onTimeRate, damageRate, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const alternatives = scored.slice(1, 3).map((s) => ({
    carrier_id: s.carrier.id,
    carrier_name: s.carrier.name,
    estimated_cost_thb: s.cost,
    trade_off: `On-time rate: ${(s.onTimeRate * 100).toFixed(0)}%, Cost: ${s.cost} THB`,
  }));

  const flags: string[] = [];
  if (canMeetSLA.length === 0) {
    flags.push("No carrier can guarantee SLA - selected fastest available");
  }
  if (order.fragile && best.damageRate > 0.015) {
    flags.push(
      `Damage rate ${(best.damageRate * 100).toFixed(1)}% is above optimal for fragile items`
    );
  }

  return {
    recommended_carrier_id: best.carrier.id,
    carrier_name: best.carrier.name,
    confidence: 0.7,
    reasoning:
      `Rule-based fallback selection (AI unavailable). ` +
      `Selected ${best.carrier.name} based on on-time rate ` +
      `(${(best.onTimeRate * 100).toFixed(0)}%) and cost (${best.cost} THB).`,
    estimated_cost_thb: best.cost,
    estimated_delivery_days: best.carrier.estimated_days_max,
    risk_flags: flags,
    alternatives,
  };
}
