import { EditPlanSchema, type EditPlan, type EditPlanDelta } from "./schema";

function normalizeLabel(value: string): string {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

/**
 * Applies a model-produced delta to the accumulated plan.
 * Raster output is always rendered from the immutable original; the plan, not the
 * previously compressed PNG, is the cumulative source of truth.
 */
export function mergeEditPlan(previous: EditPlan, delta: EditPlanDelta): EditPlan {
  const removed = new Set(delta.removeRegions.map(normalizeLabel));
  const updates = new Map(delta.regionUpdates.map((update) => [normalizeLabel(update.label), update] as const));
  const previousLabels = new Set(previous.regions.map((region) => normalizeLabel(region.label)));

  for (const label of updates.keys()) {
    if (!previousLabels.has(label) || removed.has(label)) {
      throw new Error(`A região "${label}" não existe no plano anterior ou foi removida.`);
    }
  }

  for (const label of removed) {
    if (!previousLabels.has(label)) {
      throw new Error(`A região "${label}" não existe no plano anterior.`);
    }
  }

  const regions = previous.regions
    .filter((region) => !removed.has(normalizeLabel(region.label)))
    .map((region) => {
      const update = updates.get(normalizeLabel(region.label));
      if (!update) return region;
      return {
        ...region,
        ...(update.box_2d ? { box_2d: update.box_2d } : {}),
        ...(update.mask ? { mask: update.mask } : {}),
        ...(update.feather !== undefined ? { feather: update.feather } : {}),
        ...(update.adjustments ? { adjustments: { ...region.adjustments, ...update.adjustments } } : {}),
      };
    });

  const merged = EditPlanSchema.safeParse({
    summary: delta.summary || previous.summary,
    global: { ...previous.global, ...delta.global },
    quality: { ...previous.quality, ...delta.quality },
    regions: [...regions, ...delta.regionAdds],
  });

  if (!merged.success) {
    throw new Error("A revisão incremental produziu um plano inválido.");
  }
  return merged.data;
}
