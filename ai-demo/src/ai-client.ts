import Anthropic from "@anthropic-ai/sdk";
import { CarrierRecommendation, CarrierSelectionInput } from "./types";
import { buildCarrierSelectionPrompt } from "./prompt";
import { fallbackCarrierSelection } from "./fallback";

const SYSTEM_PROMPT = `You are a logistics optimization engine.
You analyze order attributes and carrier performance data to recommend the optimal carrier.
You respond only with valid JSON matching the requested schema. No markdown, no explanation outside JSON.`;

export async function selectCarrier(
  input: CarrierSelectionInput,
  apiKey?: string
): Promise<{ result: CarrierRecommendation; source: "ai" | "fallback" }> {
  if (!apiKey) {
    console.warn("[ai-client] No API key provided - using fallback");
    return {
      result: fallbackCarrierSelection(input),
      source: "fallback",
    };
  }

  const client = new Anthropic({ apiKey });
  const userPrompt = buildCarrierSelectionPrompt(input);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the system prompt - it's identical across all carrier selection calls
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    const parsed = parseAIResponse(content.text);
    validateRecommendation(parsed, input);

    return { result: parsed, source: "ai" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai-client] AI call failed: ${message} - falling back to rule-based`);
    return {
      result: fallbackCarrierSelection(input),
      source: "fallback",
    };
  }
}

function parseAIResponse(text: string): CarrierRecommendation {
  // Strip any accidental markdown fences
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI response is not an object");
  }

  const rec = parsed as Record<string, unknown>;

  if (typeof rec.recommended_carrier_id !== "string") {
    throw new Error("Missing recommended_carrier_id");
  }
  if (typeof rec.carrier_name !== "string") {
    throw new Error("Missing carrier_name");
  }
  if (typeof rec.confidence !== "number") {
    throw new Error("Missing confidence");
  }
  if (typeof rec.reasoning !== "string") {
    throw new Error("Missing reasoning");
  }
  if (typeof rec.estimated_cost_thb !== "number") {
    throw new Error("Missing estimated_cost_thb");
  }
  if (typeof rec.estimated_delivery_days !== "number") {
    throw new Error("Missing estimated_delivery_days");
  }
  if (!Array.isArray(rec.risk_flags)) {
    throw new Error("Missing risk_flags array");
  }
  if (!Array.isArray(rec.alternatives)) {
    throw new Error("Missing alternatives array");
  }

  return rec as unknown as CarrierRecommendation;
}

function validateRecommendation(
  rec: CarrierRecommendation,
  input: CarrierSelectionInput
): void {
  const validIds = input.available_carriers.map((c) => c.id);
  if (!validIds.includes(rec.recommended_carrier_id)) {
    throw new Error(
      `AI recommended unknown carrier: ${rec.recommended_carrier_id}`
    );
  }

  if (rec.confidence < 0 || rec.confidence > 1) {
    throw new Error(`Confidence out of range: ${rec.confidence}`);
  }

  const carrier = input.available_carriers.find(
    (c) => c.id === rec.recommended_carrier_id
  );
  if (carrier && input.order.requires_cod && !carrier.supports_cod) {
    throw new Error(
      `AI recommended carrier ${rec.recommended_carrier_id} does not support COD`
    );
  }

  if (carrier && carrier.max_weight_kg < input.order.weight_kg) {
    throw new Error(
      `AI recommended carrier cannot handle order weight ${input.order.weight_kg} kg`
    );
  }
}
