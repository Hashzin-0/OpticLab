import { z } from "zod";

const bounded = (min: number, max: number) => z.number().min(min).max(max);
const coordinate = z.number().int().min(0).max(1000);
const boxSchema = z.tuple([coordinate, coordinate, coordinate, coordinate]);
const pointSchema = z.tuple([coordinate, coordinate]);

export const AdjustmentSchema = z.object({
  exposureEv: bounded(-2.5, 2.5),
  contrast: bounded(0.65, 1.5),
  saturation: bounded(0.5, 1.5),
  vibrance: bounded(-0.5, 0.8),
  warmth: bounded(-0.25, 0.25),
  highlights: bounded(-0.6, 0.6),
  shadows: bounded(-0.6, 0.6),
  blur: bounded(0, 8),
}).strict();

export const QualitySchema = z.object({
  denoise: bounded(0, 0.45),
  clarity: bounded(0, 0.7),
  sharpen: bounded(0, 0.9),
  vignette: bounded(0, 0.5),
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
  quality: QualitySchema,
  regions: z.array(RegionSchema).max(8),
}).strict();

export const AdjustmentDeltaSchema = AdjustmentSchema.partial().strict();
export const QualityDeltaSchema = QualitySchema.partial().strict();

export const RegionUpdateSchema = z.object({
  label: z.string().min(1).max(48),
  box_2d: boxSchema.optional(),
  mask: z.array(pointSchema).min(3).max(128).optional(),
  feather: bounded(0.005, 0.12).optional(),
  adjustments: AdjustmentDeltaSchema.optional(),
}).strict().refine(
  (update) => update.box_2d !== undefined
    || update.mask !== undefined
    || update.feather !== undefined
    || (update.adjustments !== undefined && Object.keys(update.adjustments).length > 0),
  "A region update must change at least one property",
);

export const EditPlanDeltaSchema = z.object({
  summary: z.string().max(240),
  global: AdjustmentDeltaSchema,
  quality: QualityDeltaSchema,
  regionUpdates: z.array(RegionUpdateSchema).max(8),
  regionAdds: z.array(RegionSchema).max(8),
  removeRegions: z.array(z.string().min(1).max(48)).max(8),
}).strict();

export type EditPlan = z.infer<typeof EditPlanSchema>;
export type Adjustment = z.infer<typeof AdjustmentSchema>;
export type Quality = z.infer<typeof QualitySchema>;
export type EditPlanDelta = z.infer<typeof EditPlanDeltaSchema>;

export const DEFAULT_ADJUSTMENT: Adjustment = {
  exposureEv: 0,
  contrast: 1,
  saturation: 1,
  vibrance: 0,
  warmth: 0,
  highlights: 0,
  shadows: 0,
  blur: 0,
};

export const DEFAULT_QUALITY: Quality = {
  denoise: 0,
  clarity: 0,
  sharpen: 0,
  vignette: 0,
};
