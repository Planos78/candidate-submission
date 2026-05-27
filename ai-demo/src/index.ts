import { selectCarrier } from "./ai-client";
import { validateInput } from "./validate";
import {
  SAMPLE_INPUT_FRAGILE_COD,
  SAMPLE_INPUT_HEAVY_ECONOMY,
} from "./sample-data";
import { CarrierSelectionInput } from "./types";

async function run(input: CarrierSelectionInput, label: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${label}`);
  console.log(`Order ID: ${input.order.id}`);
  console.log(`Destination: ${input.order.destination.province}`);
  console.log(
    `Weight: ${input.order.weight_kg} kg | Value: ${input.order.declared_value_thb} THB`
  );
  console.log(`Fragile: ${input.order.fragile} | COD: ${input.order.requires_cod}`);
  console.log(`Deadline: ${input.order.required_delivery_by}`);
  console.log(`${"=".repeat(60)}`);

  // Validate input
  const validation = validateInput(input);
  if (!validation.valid) {
    console.error("Validation failed:");
    validation.errors.forEach((e) =>
      console.error(`  - ${e.field}: ${e.message}`)
    );
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { result, source } = await selectCarrier(input, apiKey);

  console.log(`\nSource: ${source.toUpperCase()}`);
  console.log(`\nRECOMMENDATION`);
  console.log(`  Carrier: ${result.carrier_name} (${result.recommended_carrier_id})`);
  console.log(`  Cost: ${result.estimated_cost_thb} THB`);
  console.log(`  Estimated delivery: ${result.estimated_delivery_days} days`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`\nReasoning:`);
  console.log(`  ${result.reasoning}`);

  if (result.risk_flags.length > 0) {
    console.log(`\nRisk Flags:`);
    result.risk_flags.forEach((f) => console.log(`  ! ${f}`));
  }

  if (result.alternatives.length > 0) {
    console.log(`\nAlternatives:`);
    result.alternatives.forEach((a) =>
      console.log(`  - ${a.carrier_name} (${a.estimated_cost_thb} THB): ${a.trade_off}`)
    );
  }
}

async function main(): Promise<void> {
  console.log("Smart Carrier Selection Demo");
  console.log("AI-powered carrier recommendation for fulfillment platform");

  try {
    await run(SAMPLE_INPUT_FRAGILE_COD, "Fragile item + COD, tight SLA, Chiang Mai");
    await run(SAMPLE_INPUT_HEAVY_ECONOMY, "Heavy item, cost-sensitive, Bangkok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Fatal error: ${message}`);
    process.exit(1);
  }
}

main();
