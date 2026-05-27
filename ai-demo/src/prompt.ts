import {
  CarrierSelectionInput,
  CarrierOption,
  CarrierHistoricalPerformance,
} from "./types";

function getDaysUntilDeadline(deadline: string): number {
  const now = new Date();
  const due = new Date(deadline);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getRelevantPerformance(
  performance: CarrierHistoricalPerformance[],
  province: string
): CarrierHistoricalPerformance[] {
  const relevant = performance.filter((p) => p.province === province);
  if (relevant.length > 0) return relevant;
  // Fall back to all available data if no province-specific data
  return performance;
}

function estimateCost(carrier: CarrierOption, weight_kg: number): number {
  return Math.round(carrier.base_cost_thb + carrier.cost_per_kg_thb * weight_kg);
}

export function buildCarrierSelectionPrompt(input: CarrierSelectionInput): string {
  const { order, available_carriers, historical_performance } = input;

  const daysUntil = getDaysUntilDeadline(order.required_delivery_by);
  const relevantPerf = getRelevantPerformance(
    historical_performance,
    order.destination.province
  );

  const eligibleCarriers = available_carriers.filter((c) => {
    if (c.max_weight_kg < order.weight_kg) return false;
    if (order.requires_cod && !c.supports_cod) return false;
    if (
      c.supported_provinces.length > 0 &&
      !c.supported_provinces.includes(order.destination.province)
    )
      return false;
    return true;
  });

  const carrierDetails = eligibleCarriers.map((c) => {
    const perf = relevantPerf.find((p) => p.carrier_id === c.id);
    const cost = estimateCost(c, order.weight_kg);
    return {
      id: c.id,
      name: c.name,
      estimated_cost_thb: cost,
      estimated_days_min: c.estimated_days_min,
      estimated_days_max: c.estimated_days_max,
      supports_cod: c.supports_cod,
      historical: perf
        ? {
            on_time_rate: perf.on_time_rate,
            damage_rate: perf.damage_rate,
            avg_actual_days: perf.avg_actual_days,
            sample_size: perf.sample_size,
          }
        : null,
    };
  });

  return `You are a logistics optimization engine for a Thai e-commerce fulfillment platform.

Select the best carrier for this order and explain your reasoning.

## Order Details
- Order ID: ${order.id}
- Weight: ${order.weight_kg} kg
- Dimensions: ${order.dimensions.length_cm}x${order.dimensions.width_cm}x${order.dimensions.height_cm} cm
- Destination: ${order.destination.district}, ${order.destination.province} (${order.destination.postcode})
- Delivery deadline: ${order.required_delivery_by} (${daysUntil} days from now)
- Declared value: ${order.declared_value_thb} THB
- Fragile: ${order.fragile}
- COD required: ${order.requires_cod}
- Marketplace: ${order.marketplace}

## Eligible Carriers
${JSON.stringify(carrierDetails, null, 2)}

## Scoring Criteria (in order of priority)
1. Can deliver within SLA deadline (${daysUntil} days)
2. COD requirement satisfied (${order.requires_cod})
3. If fragile=true, minimize damage_rate
4. Maximize on_time_rate for destination province
5. Minimize cost (secondary to reliability for high-value orders > 2000 THB)
6. For low-value orders (< 500 THB), cost is primary after SLA

## Response Format
Respond with a single valid JSON object matching this exact schema:
{
  "recommended_carrier_id": "string",
  "carrier_name": "string",
  "confidence": number (0.0-1.0),
  "reasoning": "string (2-3 sentences explaining the decision)",
  "estimated_cost_thb": number,
  "estimated_delivery_days": number,
  "risk_flags": ["string"],
  "alternatives": [
    {
      "carrier_id": "string",
      "carrier_name": "string",
      "estimated_cost_thb": number,
      "trade_off": "string (one sentence)"
    }
  ]
}

Rules:
- recommended_carrier_id must be one of the eligible carrier IDs provided
- confidence reflects how clearly one carrier dominates; use 0.5-0.7 for close calls
- risk_flags should note any concerns (e.g., "fragile item with above-average damage rate", "tight SLA")
- Include 1-2 alternatives maximum
- Do not include markdown, only raw JSON`;
}
