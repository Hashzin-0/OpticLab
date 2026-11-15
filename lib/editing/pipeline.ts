import { EditPlanSchema, type EditPlan } from "./schema";
import { applyEditPlan } from "./engine";

export interface AutoEditResult {
  image: string;
  plan: EditPlan;
}

/** One orchestration entry point. Refinements send the accumulated plan as context. */
export async function runAutoEdit(
  original: string,
  instruction: string,
  previousPlan: EditPlan | null,
): Promise<AutoEditResult> {
  const response = await fetch("/api/auto-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: original, instruction, previousPlan }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload
      ? String(payload.error)
      : "Não foi possível processar a fotografia.";
    throw new Error(message);
  }

  const parsed = EditPlanSchema.safeParse(
    typeof payload === "object" && payload !== null && "plan" in payload ? payload.plan : null,
  );
  if (!parsed.success) throw new Error("O servidor retornou um plano de edição inválido.");

  // Recompose the accumulated plan from the immutable source, never from a compressed prior output.
  const image = await applyEditPlan(original, parsed.data);
  return { image, plan: parsed.data };
}
