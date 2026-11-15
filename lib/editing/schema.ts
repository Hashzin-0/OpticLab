import { z } from "zod";

const bounded = (min: number, max: number) => z.number().min(min).max(max);
const coordinate = z.number().int().min(0).max(1000);
const boxSchema = z.tuple([coordinate, coordinate, coordinate, coordinate]);
const pointSchema = z.tuple([coordinate, coordinate]);

export const AdjustmentSchema = z.object({
  exposureEv: bounded(-2.5, 2.5),
  contrast: bounded(0.65, 1.5),
  saturation: bounded(0.5, 1.5),
  warmth: bounded(-0.25, 0.25),
  highlights: bounded(-0.6, 0.6),
  shadows: bounded(-0.6, 0.6),
  blur: bounded(0, 8),
}).strict();

export const RegionSchema = z.object({
  label: z.string().min(1).max(48),
  // Gemini segmentation: [ymin, xmin, ymax, xmax], normalized to 0..1000.
  box_2d: boxSchema,
  // Polygon contour points [x, y], normalized to 0..1000.
  mask: z.array(pointSchema).min(3).max(128),
  feather: bounded(0.005, 0.12),
  adjustments: AdjustmentSchema,
}).strict().superRefine((region, ctx) => {
  const [yMin, xMin, yMax, xMax] = region.box_2d;
  if (yMin >= yMax || xMin >= xMax) {
    ctx.addIssue({ code: "custom", message: "Invalid segmentation bounding box" });
  }
  for (const [x, y] of region.mask) {
    if (x < xMin - 5 || x > xMax + 5 || y < yMin - 5 || y > yMax + 5) {
      ctx.addIssue({ code: "custom", message: "Segmentation contour is outside its bounding box" });
      break;
    }
  }
});

export const EditPlanSchema = z.object({
  summary: z.string().max(240),
  global: AdjustmentSchema,
  regions: z.array(RegionSchema).max(8),
}).strict();

export type EditPlan = z.infer<typeof EditPlanSchema>;
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const DEFAULT_ADJUSTMENT: Adjustment = {
  exposureEv: 0,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  highlights: 0,
  shadows: 0,
  blur: 0,
};
