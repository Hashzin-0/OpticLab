import { describe, expect, it } from "vitest";
import { EditPlanSchema } from "../lib/editing/schema";

const neutral = {
  exposureEv: 0, contrast: 1, saturation: 1, warmth: 0, highlights: 0, shadows: 0, blur: 0,
};
const region = {
  label: "céu",
  box_2d: [100, 100, 500, 500],
  mask: [[150, 150], [450, 150], [400, 450], [180, 420]],
  feather: 0.04,
  adjustments: neutral,
};

describe("EditPlanSchema", () => {
  it("accepts a bounded global plan with no regions", () => {
    expect(EditPlanSchema.safeParse({ summary: "Correção natural", global: neutral, regions: [] }).success).toBe(true);
  });

  it("accepts a region with a normalized segmentation contour", () => {
    expect(EditPlanSchema.safeParse({ summary: "Máscara", global: neutral, regions: [region] }).success).toBe(true);
  });

  it("rejects out-of-range exposure", () => {
    expect(EditPlanSchema.safeParse({ summary: "Invalid", global: { ...neutral, exposureEv: 9 }, regions: [] }).success).toBe(false);
  });

  it("rejects a segmentation box with inverted coordinates", () => {
    expect(EditPlanSchema.safeParse({
      summary: "Invalid box",
      global: neutral,
      regions: [{ ...region, box_2d: [500, 500, 100, 100] }],
    }).success).toBe(false);
  });

  it("rejects a contour outside its bounding box", () => {
    expect(EditPlanSchema.safeParse({
      summary: "Invalid mask",
      global: neutral,
      regions: [{ ...region, mask: [[800, 800], [850, 800], [850, 850]] }],
    }).success).toBe(false);
  });

  it("rejects more than eight internal regions", () => {
    expect(EditPlanSchema.safeParse({ summary: "Too many", global: neutral, regions: Array.from({ length: 9 }, () => region) }).success).toBe(false);
  });
});
