import {
  CarrierSelectionInput,
  ValidationResult,
  ValidationError,
} from "./types";

export function validateInput(input: CarrierSelectionInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Order validations
  const { order } = input;

  if (!order.id || typeof order.id !== "string") {
    errors.push({ field: "order.id", message: "Order ID is required" });
  }

  if (
    typeof order.weight_kg !== "number" ||
    order.weight_kg <= 0 ||
    order.weight_kg > 500
  ) {
    errors.push({
      field: "order.weight_kg",
      message: "Weight must be a positive number up to 500 kg",
    });
  }

  const { dimensions } = order;
  if (
    !dimensions ||
    dimensions.length_cm <= 0 ||
    dimensions.width_cm <= 0 ||
    dimensions.height_cm <= 0
  ) {
    errors.push({
      field: "order.dimensions",
      message: "All dimensions must be positive numbers",
    });
  }

  if (!order.destination?.province) {
    errors.push({
      field: "order.destination.province",
      message: "Destination province is required",
    });
  }

  if (!order.destination?.postcode || !/^\d{5}$/.test(order.destination.postcode)) {
    errors.push({
      field: "order.destination.postcode",
      message: "Postcode must be 5 digits",
    });
  }

  const deadline = new Date(order.required_delivery_by);
  if (isNaN(deadline.getTime())) {
    errors.push({
      field: "order.required_delivery_by",
      message: "required_delivery_by must be a valid ISO 8601 date string",
    });
  } else if (deadline <= new Date()) {
    errors.push({
      field: "order.required_delivery_by",
      message: "Delivery deadline must be in the future",
    });
  }

  if (
    typeof order.declared_value_thb !== "number" ||
    order.declared_value_thb < 0
  ) {
    errors.push({
      field: "order.declared_value_thb",
      message: "declared_value_thb must be a non-negative number",
    });
  }

  // Carrier validations
  if (!Array.isArray(input.available_carriers) || input.available_carriers.length === 0) {
    errors.push({
      field: "available_carriers",
      message: "At least one carrier must be provided",
    });
  }

  // Historical performance validations (optional but check structure if present)
  if (input.historical_performance) {
    input.historical_performance.forEach((p, i) => {
      if (p.on_time_rate < 0 || p.on_time_rate > 1) {
        errors.push({
          field: `historical_performance[${i}].on_time_rate`,
          message: "on_time_rate must be between 0 and 1",
        });
      }
      if (p.damage_rate < 0 || p.damage_rate > 1) {
        errors.push({
          field: `historical_performance[${i}].damage_rate`,
          message: "damage_rate must be between 0 and 1",
        });
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
