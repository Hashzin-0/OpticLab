import { z } from "zod";

const bounded = (min: number, max: number) => z.number().min(min).max(max);

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
  // Normalized bounding box, used to build a feathered internal mask.
  bounds: z.object({
    x: bounded(0, 1),
    y: bounded(0, 1),
    width: bounded(0.01, 1),
    height: bounded(0.01, 1),
  }).strict(),
  feather: bounded(0.01, 0.35),
  adjustments: AdjustmentSchema,
}).strict();

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