import { describe, expect, it } from "vitest";
import { mergeEditPlan } from "../lib/editing/refinement";
import type { EditPlan } from "../lib/editing/schema";

const neutral = {
  exposureEv: 0, contrast: 1, saturation: 1, vibrance: 0, warmth: 0, highlights: 0, shadows: 0, blur: 0,
};
const base: EditPlan = {
  summary: "Primeira edição",
  global: { ...neutral, exposureEv: 0.35, saturation: 1.12 },
  quality: { denoise: 0.12, clarity: 0.2, sharpen: 0.35, vignette: 0.1 },
  regions: [{
    label: "céu",
    box_2d: [100, 100, 500, 500],
    mask: [[150, 150], [450, 150], [400, 450], [180, 420]],
    feather: 0.04,
    adjustments: { ...neutral, highlights: 0.2 },
  }],
};

function delta(overrides: Partial<Parameters<typeof mergeEditPlan>[1]> = {}): Parameters<typeof mergeEditPlan>[1] {
  return {
    summary: "Edição refinada",
    global: {},
    quality: {},
    regionUpdates: [],
    regionAdds: [],
    removeRegions: [],
    ...overrides,
  };
}

describe("mergeEditPlan", () => {
  it("changes only the requested global parameter and preserves previous adjustments", () => {
    const result = mergeEditPlan(base, delta({ global: { warmth: 0.08 } }));
    expect(result.global).toEqual({ ...base.global, warmth: 0.08 });
    expect(result.quality).toEqual(base.quality);
    expect(result.regions).toEqual(base.regions);
  });

  it("updates one region without resetting its other parameters or mask", () => {
    const result = mergeEditPlan(base, delta({
      regionUpdates: [{ label: "céu", adjustments: { highlights: 0.35 } }],
    }));
    expect(result.regions[0].adjustments).toEqual({ ...base.regions[0].adjustments, highlights: 0.35 });
    expect(result.regions[0].mask).toEqual(base.regions[0].mask);
    expect(result.global).toEqual(base.global);
  });

  it("matches region labels independent of Portuguese accents", () => {
    const result = mergeEditPlan(base, delta({
      regionUpdates: [{ label: "ceu", adjustments: { highlights: 0.3 } }],
    }));
    expect(result.regions[0].adjustments.highlights).toBe(0.3);
  });

  it("preserves prior quality settings unless the delta changes them", () => {
    const result = mergeEditPlan(base, delta({ quality: { sharpen: 0.5 } }));
    expect(result.quality).toEqual({ ...base.quality, sharpen: 0.5 });
  });

  it("removes only an explicitly named region", () => {
    const result = mergeEditPlan(base, delta({ removeRegions: ["céu"] }));
    expect(result.regions).toEqual([]);
  });

  it("rejects updates for regions that do not exist", () => {
    expect(() => mergeEditPlan(base, delta({
      regionUpdates: [{ label: "rosto", adjustments: { warmth: 0.1 } }],
    }))).toThrow(/não existe/);
  });
});
