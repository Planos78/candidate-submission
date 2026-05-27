import {
  CarrierSelectionInput,
  CarrierOption,
  CarrierHistoricalPerformance,
} from "./types";

export const AVAILABLE_CARRIERS: CarrierOption[] = [
  {
    id: "kerry",
    name: "Kerry Express",
    base_cost_thb: 35,
    cost_per_kg_thb: 8,
    estimated_days_min: 1,
    estimated_days_max: 3,
    supports_cod: true,
    max_weight_kg: 30,
    supported_provinces: [], // nationwide
  },
  {
    id: "flash",
    name: "Flash Express",
    base_cost_thb: 25,
    cost_per_kg_thb: 6,
    estimated_days_min: 1,
    estimated_days_max: 3,
    supports_cod: true,
    max_weight_kg: 20,
    supported_provinces: [], // nationwide
  },
  {
    id: "jnt",
    name: "J&T Express",
    base_cost_thb: 28,
    cost_per_kg_thb: 7,
    estimated_days_min: 1,
    estimated_days_max: 4,
    supports_cod: true,
    max_weight_kg: 25,
    supported_provinces: [],
  },
  {
    id: "thaipost",
    name: "Thailand Post EMS",
    base_cost_thb: 40,
    cost_per_kg_thb: 12,
    estimated_days_min: 2,
    estimated_days_max: 5,
    supports_cod: false,
    max_weight_kg: 20,
    supported_provinces: [],
  },
  {
    id: "dhl",
    name: "DHL Express",
    base_cost_thb: 120,
    cost_per_kg_thb: 35,
    estimated_days_min: 1,
    estimated_days_max: 2,
    supports_cod: false,
    max_weight_kg: 70,
    supported_provinces: [
      "Bangkok",
      "Nonthaburi",
      "Samut Prakan",
      "Chiang Mai",
      "Phuket",
    ],
  },
];

export const HISTORICAL_PERFORMANCE: CarrierHistoricalPerformance[] = [
  // Kerry - Chiang Mai strong
  {
    carrier_id: "kerry",
    province: "Chiang Mai",
    on_time_rate: 0.94,
    damage_rate: 0.008,
    avg_actual_days: 2.1,
    sample_size: 4200,
  },
  {
    carrier_id: "kerry",
    province: "Bangkok",
    on_time_rate: 0.97,
    damage_rate: 0.005,
    avg_actual_days: 1.2,
    sample_size: 18000,
  },
  // Flash - cheap but more damage in remote areas
  {
    carrier_id: "flash",
    province: "Chiang Mai",
    on_time_rate: 0.88,
    damage_rate: 0.022,
    avg_actual_days: 2.4,
    sample_size: 3100,
  },
  {
    carrier_id: "flash",
    province: "Bangkok",
    on_time_rate: 0.93,
    damage_rate: 0.012,
    avg_actual_days: 1.4,
    sample_size: 12000,
  },
  // J&T
  {
    carrier_id: "jnt",
    province: "Chiang Mai",
    on_time_rate: 0.85,
    damage_rate: 0.018,
    avg_actual_days: 2.8,
    sample_size: 2800,
  },
  {
    carrier_id: "jnt",
    province: "Bangkok",
    on_time_rate: 0.91,
    damage_rate: 0.009,
    avg_actual_days: 1.6,
    sample_size: 9500,
  },
  // DHL - premium, very reliable
  {
    carrier_id: "dhl",
    province: "Chiang Mai",
    on_time_rate: 0.99,
    damage_rate: 0.001,
    avg_actual_days: 1.1,
    sample_size: 450,
  },
  {
    carrier_id: "dhl",
    province: "Bangkok",
    on_time_rate: 0.99,
    damage_rate: 0.001,
    avg_actual_days: 1.0,
    sample_size: 3200,
  },
  // Thailand Post
  {
    carrier_id: "thaipost",
    province: "Chiang Mai",
    on_time_rate: 0.79,
    damage_rate: 0.015,
    avg_actual_days: 3.5,
    sample_size: 1200,
  },
];

// Scenario 1: Fragile item, tight SLA, COD required
export const SAMPLE_INPUT_FRAGILE_COD: CarrierSelectionInput = {
  order: {
    id: "ORD-2024-001",
    weight_kg: 2.5,
    dimensions: { length_cm: 30, width_cm: 20, height_cm: 15 },
    destination: {
      province: "Chiang Mai",
      district: "Mueang",
      postcode: "50000",
    },
    required_delivery_by: new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString(),
    declared_value_thb: 3500,
    fragile: true,
    marketplace: "Shopee",
    requires_cod: true,
  },
  available_carriers: AVAILABLE_CARRIERS,
  historical_performance: HISTORICAL_PERFORMANCE,
};

// Scenario 2: Heavy item, cost-sensitive, no COD
export const SAMPLE_INPUT_HEAVY_ECONOMY: CarrierSelectionInput = {
  order: {
    id: "ORD-2024-002",
    weight_kg: 15,
    dimensions: { length_cm: 60, width_cm: 40, height_cm: 35 },
    destination: {
      province: "Bangkok",
      district: "Chatuchak",
      postcode: "10900",
    },
    required_delivery_by: new Date(
      Date.now() + 5 * 24 * 60 * 60 * 1000
    ).toISOString(),
    declared_value_thb: 800,
    fragile: false,
    marketplace: "Lazada",
    requires_cod: false,
  },
  available_carriers: AVAILABLE_CARRIERS,
  historical_performance: HISTORICAL_PERFORMANCE,
};
