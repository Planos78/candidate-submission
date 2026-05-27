export interface OrderInput {
  id: string;
  weight_kg: number;
  dimensions: {
    length_cm: number;
    width_cm: number;
    height_cm: number;
  };
  destination: {
    province: string;
    district: string;
    postcode: string;
  };
  required_delivery_by: string; // ISO 8601 date string
  declared_value_thb: number;
  fragile: boolean;
  marketplace: string;
  requires_cod: boolean;
}

export interface CarrierOption {
  id: string;
  name: string;
  base_cost_thb: number;
  cost_per_kg_thb: number;
  estimated_days_min: number;
  estimated_days_max: number;
  supports_cod: boolean;
  max_weight_kg: number;
  supported_provinces: string[]; // empty array = nationwide
}

export interface CarrierHistoricalPerformance {
  carrier_id: string;
  province: string;
  on_time_rate: number; // 0.0 - 1.0
  damage_rate: number; // 0.0 - 1.0
  avg_actual_days: number;
  sample_size: number;
}

export interface CarrierSelectionInput {
  order: OrderInput;
  available_carriers: CarrierOption[];
  historical_performance: CarrierHistoricalPerformance[];
}

export interface CarrierAlternative {
  carrier_id: string;
  carrier_name: string;
  estimated_cost_thb: number;
  trade_off: string;
}

export interface CarrierRecommendation {
  recommended_carrier_id: string;
  carrier_name: string;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  estimated_cost_thb: number;
  estimated_delivery_days: number;
  risk_flags: string[];
  alternatives: CarrierAlternative[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };
