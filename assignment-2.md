# Assignment 2: AI-Powered Feature Demo

## Feature: Smart Carrier Selection

---

## 1. Problem

Fulfillment teams manually select carriers using static rule tables or personal judgment. These rules are updated infrequently and cannot adapt to:
- Carrier performance degradation in specific regions (e.g., Flash Express reliability drops in Chiang Mai during Q4)
- Order-specific constraints (fragile items require low damage-rate carriers even at higher cost)
- SLA deadline pressure (nearest deadline = must prioritize speed over cost)
- Changing carrier pricing

The result is preventable SLA misses, customer damage claims, and unnecessary shipping cost.

---

## 2. Target User

**Primary**: Fulfillment operations team leads and warehouse managers who configure routing rules.  
**Indirect beneficiary**: End customers (faster, safer delivery) and finance teams (lower shipping cost).

In the automated path, the feature runs without human interaction on every order. The ops team interacts with it via configuration (weights, thresholds) and via the exception queue (orders flagged for manual review).

---

## 3. Product Context

This feature lives in the **Order Routing Service**, executing after warehouse allocation and before shipment creation.

Flow:
```
Order allocated to warehouse
        |
        v
[Smart Carrier Selection]  <-- this feature
        |
        v
Carrier assigned to order
        |
        v
Carrier Integration Service creates label
```

The recommendation is stored on the order record (`carrier_id`, `carrier_selection_source: "ai"|"fallback"`, `carrier_selection_reasoning`). Ops dashboard shows the reasoning, enabling the team to audit decisions and detect patterns.

---

## 4. AI Capability

Given:
- Order attributes: weight, dimensions, destination, SLA deadline, declared value, fragile flag, COD requirement
- Available carriers and their rate cards
- Historical carrier performance per route (on-time rate, damage rate, actual delivery days, sample size)

The AI:
1. Filters ineligible carriers (weight limit, COD support, province coverage) - deterministic, done before the AI call
2. Scores remaining carriers across four dimensions: SLA feasibility, reliability (on-time rate), fragility risk (damage rate), cost
3. Returns a structured recommendation with confidence score, reasoning, risk flags, and alternatives

The AI is not inventing data - it is reasoning about the trade-offs between carriers given structured, pre-filtered data. This is a judgment task, not a retrieval task.

---

## 5. Small Demo

See `ai-demo/` directory.

### Key files

| File | Purpose |
|---|---|
| `src/types.ts` | `CarrierSelectionInput`, `CarrierRecommendation` interfaces |
| `src/sample-data.ts` | Two realistic scenarios with Thai carriers and historical performance |
| `src/prompt.ts` | Builds structured prompt; filters ineligible carriers before AI call |
| `src/ai-client.ts` | Anthropic SDK call with prompt caching; parses + validates AI response |
| `src/validate.ts` | Input validation (weight, postcode format, future deadline, etc.) |
| `src/fallback.ts` | Rule-based selection used when AI is unavailable |
| `src/index.ts` | Runs both demo scenarios |
| `tests/ai-demo.test.ts` | Unit tests for validation, fallback, prompt |

### Sample Input (Scenario 1)

```typescript
{
  order: {
    id: "ORD-2024-001",
    weight_kg: 2.5,
    destination: { province: "Chiang Mai", postcode: "50000" },
    required_delivery_by: "2026-05-29T00:00:00Z",  // 2 days
    declared_value_thb: 3500,
    fragile: true,
    requires_cod: true,
    marketplace: "Shopee"
  },
  available_carriers: [Kerry, Flash, J&T, ThaiPost, DHL],
  historical_performance: [...]  // per carrier per province
}
```

### AI Prompt Structure

The prompt (see `src/prompt.ts`) sends to Claude:
- Filtered eligible carriers with pre-calculated costs
- Historical performance data for the destination province
- Explicit scoring criteria and priority order
- Required JSON output schema

### Sample AI Output

```json
{
  "recommended_carrier_id": "kerry",
  "carrier_name": "Kerry Express",
  "confidence": 0.87,
  "reasoning": "Kerry Express has the highest on-time rate for Chiang Mai (94%) and lowest damage rate (0.8%) among COD-eligible carriers, critical for a fragile 3,500 THB item. The 2-day delivery window is achievable within Kerry's 1-3 day range. Flash Express is cheaper but has a damage rate nearly 3x higher.",
  "estimated_cost_thb": 55,
  "estimated_delivery_days": 2,
  "risk_flags": [],
  "alternatives": [
    {
      "carrier_id": "flash",
      "carrier_name": "Flash Express",
      "estimated_cost_thb": 40,
      "trade_off": "15 THB cheaper but damage rate 2.2% vs Kerry's 0.8% - not suitable for fragile items"
    }
  ]
}
```

---

## 6. Explanation

### Why this feature is valuable

Every fulfilled order involves a carrier decision. At 2M orders/day, even a 1% improvement in SLA hit rate prevents 20,000 late deliveries. A 5 THB average cost reduction saves 10M THB/day. The value compounds because the system learns from historical performance data that changes over time, whereas static rules require manual maintenance.

### What data is sent to AI

- Order metadata: weight, dimensions, destination province/postcode, deadline, declared value, fragile flag, COD flag, marketplace
- Carrier options: IDs, names, estimated cost (calculated locally), delivery range, COD support
- Aggregated historical performance: on-time rate, damage rate, average days, sample size per carrier per province

### What data should NOT be sent to AI

- Customer PII: name, address details beyond province/postcode, phone number
- Carrier API credentials or pricing contracts
- Internal warehouse IDs or business-sensitive capacity data
- Individual past order IDs (only aggregate statistics)

The prompt is designed so that province-level aggregates are sufficient. Postcode is included for routing completeness but does not expose individual customer data.

### How the AI output is used

The `recommended_carrier_id` is written to `orders.carrier_id` automatically. The `reasoning`, `confidence`, and `risk_flags` are stored as metadata and surfaced in the ops dashboard for audit. Orders with `confidence < 0.6` or non-empty `risk_flags` are flagged for optional manual review.

### Whether human approval is required

No approval required for standard orders (confidence >= 0.6, no risk flags). Human review is triggered for:
- Confidence < 0.6 (close call between carriers)
- High-value orders > 10,000 THB
- Orders with active carrier disruption alerts (fed from a separate carrier status feed)

### What guardrails are needed

1. **Pre-filtering** (in `prompt.ts`): Only eligible carriers reach the AI. COD, weight, and province constraints are enforced deterministically before the prompt is built.
2. **Output validation** (in `ai-client.ts`): AI-recommended carrier ID must exist in the input set; COD/weight constraints are re-checked on the AI's output.
3. **Confidence threshold**: Low-confidence recommendations are flagged, not blocked.
4. **Automatic fallback** (in `fallback.ts`): If AI fails, returns an invalid carrier, or times out, the rule-based fallback runs transparently.
5. **Carrier ID whitelist**: The prompt explicitly lists carrier IDs the AI may choose from. Hallucinated IDs are caught by validation.

### What happens if AI is wrong or unavailable

**Unavailable**: `fallback.ts` provides rule-based selection using the same eligibility filters and a scoring heuristic. The `carrier_selection_source` field is set to `"fallback"` so ops teams can monitor the fallback rate.

**Wrong recommendation**: The output validation layer in `ai-client.ts` catches structural errors (invalid carrier ID, COD constraint violation, weight violation) and falls back. Business-level errors (correct carrier ID but suboptimal choice) are caught over time via the evaluation loop described below.

### How you would evaluate success

**Online metrics** (measure daily):
- SLA hit rate: % of orders delivered by deadline, segmented by selection source (AI vs fallback vs old rules)
- Damage claim rate: % of orders with damage complaints
- Average shipping cost per kg
- Fallback rate: % of orders served by fallback (target < 1%)

**Offline evaluation** (monthly):
- Backtesting: run AI selection on past 30 days of orders, compare recommended carrier against actual carrier, check whether AI choice would have produced better SLA + lower cost
- Calibration: check confidence scores vs actual outcome correctness (well-calibrated = 80% confidence -> 80% correct)

**Launch approach**: Shadow mode first - run AI selection in parallel with existing rules, log both decisions, compare outcomes for 2 weeks before making AI the primary path. This validates the feature without risking real orders.
