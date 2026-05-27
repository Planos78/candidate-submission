import { validateInput } from "../src/validate";
import { fallbackCarrierSelection } from "../src/fallback";
import { buildCarrierSelectionPrompt } from "../src/prompt";
import {
  SAMPLE_INPUT_FRAGILE_COD,
  SAMPLE_INPUT_HEAVY_ECONOMY,
  AVAILABLE_CARRIERS,
} from "../src/sample-data";
import { CarrierSelectionInput } from "../src/types";

// ---- Validation tests ----

describe("validateInput", () => {
  test("accepts valid fragile COD input", () => {
    const result = validateInput(SAMPLE_INPUT_FRAGILE_COD);
    expect(result.valid).toBe(true);
  });

  test("accepts valid heavy economy input", () => {
    const result = validateInput(SAMPLE_INPUT_HEAVY_ECONOMY);
    expect(result.valid).toBe(true);
  });

  test("rejects negative weight", () => {
    const input: CarrierSelectionInput = {
      ...SAMPLE_INPUT_FRAGILE_COD,
      order: { ...SAMPLE_INPUT_FRAGILE_COD.order, weight_kg: -1 },
    };
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "order.weight_kg")).toBe(true);
    }
  });

  test("rejects invalid postcode", () => {
    const input: CarrierSelectionInput = {
      ...SAMPLE_INPUT_FRAGILE_COD,
      order: {
        ...SAMPLE_INPUT_FRAGILE_COD.order,
        destination: { ...SAMPLE_INPUT_FRAGILE_COD.order.destination, postcode: "123" },
      },
    };
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.field === "order.destination.postcode")
      ).toBe(true);
    }
  });

  test("rejects past delivery deadline", () => {
    const input: CarrierSelectionInput = {
      ...SAMPLE_INPUT_FRAGILE_COD,
      order: {
        ...SAMPLE_INPUT_FRAGILE_COD.order,
        required_delivery_by: "2020-01-01T00:00:00Z",
      },
    };
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.field === "order.required_delivery_by")
      ).toBe(true);
    }
  });

  test("rejects empty carriers array", () => {
    const input: CarrierSelectionInput = {
      ...SAMPLE_INPUT_FRAGILE_COD,
      available_carriers: [],
    };
    const result = validateInput(input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "available_carriers")).toBe(true);
    }
  });
});

// ---- Fallback tests ----

describe("fallbackCarrierSelection", () => {
  test("returns a valid recommendation for fragile COD order", () => {
    const result = fallbackCarrierSelection(SAMPLE_INPUT_FRAGILE_COD);
    expect(result.recommended_carrier_id).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.estimated_cost_thb).toBeGreaterThan(0);
    expect(Array.isArray(result.risk_flags)).toBe(true);
    expect(Array.isArray(result.alternatives)).toBe(true);
  });

  test("only selects COD-capable carrier for COD order", () => {
    const result = fallbackCarrierSelection(SAMPLE_INPUT_FRAGILE_COD);
    const selectedCarrier = AVAILABLE_CARRIERS.find(
      (c) => c.id === result.recommended_carrier_id
    );
    expect(selectedCarrier).toBeDefined();
    expect(selectedCarrier!.supports_cod).toBe(true);
  });

  test("does not exceed carrier max weight", () => {
    const result = fallbackCarrierSelection(SAMPLE_INPUT_HEAVY_ECONOMY);
    const selectedCarrier = AVAILABLE_CARRIERS.find(
      (c) => c.id === result.recommended_carrier_id
    );
    expect(selectedCarrier).toBeDefined();
    expect(selectedCarrier!.max_weight_kg).toBeGreaterThanOrEqual(
      SAMPLE_INPUT_HEAVY_ECONOMY.order.weight_kg
    );
  });

  test("throws when no carrier can fulfill order", () => {
    const impossibleInput: CarrierSelectionInput = {
      ...SAMPLE_INPUT_HEAVY_ECONOMY,
      order: { ...SAMPLE_INPUT_HEAVY_ECONOMY.order, weight_kg: 1000 },
    };
    expect(() => fallbackCarrierSelection(impossibleInput)).toThrow(
      "No eligible carriers found"
    );
  });

  test("includes reasoning string", () => {
    const result = fallbackCarrierSelection(SAMPLE_INPUT_FRAGILE_COD);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(10);
  });
});

// ---- Prompt tests ----

describe("buildCarrierSelectionPrompt", () => {
  test("includes order ID in prompt", () => {
    const prompt = buildCarrierSelectionPrompt(SAMPLE_INPUT_FRAGILE_COD);
    expect(prompt).toContain(SAMPLE_INPUT_FRAGILE_COD.order.id);
  });

  test("includes destination province in prompt", () => {
    const prompt = buildCarrierSelectionPrompt(SAMPLE_INPUT_FRAGILE_COD);
    expect(prompt).toContain(SAMPLE_INPUT_FRAGILE_COD.order.destination.province);
  });

  test("filters out carriers that cannot handle weight or COD", () => {
    const prompt = buildCarrierSelectionPrompt(SAMPLE_INPUT_FRAGILE_COD);
    // DHL does not support COD and has limited province coverage - should be excluded
    const carriersSection = prompt.split("## Eligible Carriers")[1];
    expect(carriersSection).toBeDefined();
    // DHL carrier object should not appear in eligible carriers JSON block
    expect(carriersSection).not.toContain('"id": "dhl"');
  });

  test("returns a non-empty string", () => {
    const prompt = buildCarrierSelectionPrompt(SAMPLE_INPUT_HEAVY_ECONOMY);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });
});
