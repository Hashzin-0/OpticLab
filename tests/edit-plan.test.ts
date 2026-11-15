import { describe, expect, it } from "vitest";
import { EditPlanSchema } from "../lib/editing/schema";

const neutral = {
  exposureEv: 0, contrast: 1, saturation: 1, warmth: 0, highlights: 0, shadows: 0, blur: 0,
};

describe("EditPlanSchema", () => {
  it("accepts a bounded global plan with no regions", () => {
    expect(EditPlanSchema.safeParse({ summary: "Correção natural", global: neutral, regions: [] }).success).toBe(true);
  });

  it("rejects out-of-range exposure", () => {
    expect(EditPlanSchema.safeParse({ summary: "Invalid", global: { ...neutral, exposureEv: 9 }, regions: [] }).success).toBe(false);
  });

  it("rejects masks that extend beyond the normalized image bounds", () => {
    const region = { label: "céu", bounds: { x: 0.8, y: 0, width: 0.4, height: 0.5 }, feather: 0.1, adjustments: neutral };
    expect(EditPlanSchema.safeParse({ summary: "Out of bounds", global: neutral, regions: [region] }).success).toBe(false);
  });

  it("rejects more than eight internal regions", () => {
    const region = { label: "céu", bounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, feather: 0.1, adjustments: neutral };
    expect(EditPlanSchema.safeParse({ summary: "Too many", global: neutral, regions: Array.from({ length: 9 }, () => region) }).success).toBe(false);
  });
});
