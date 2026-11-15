import { describe, expect, it } from "vitest";
import { AdjustmentSchema, DEFAULT_ADJUSTMENT } from "../lib/editing/schema";
import { CINEMATIC_CATALOG, CINEMATIC_CATALOG_VERSION, retrieveCinematicLooks } from "../lib/cinematic/catalog";

describe("cinematic knowledge catalog", () => {
  it("ships a broad, versioned library rather than a small seed list", () => {
    expect(CINEMATIC_CATALOG_VERSION).toBe("2.0.0");
    expect(CINEMATIC_CATALOG.length).toBeGreaterThanOrEqual(50);
    expect(new Set(CINEMATIC_CATALOG.map((look) => look.id)).size).toBe(CINEMATIC_CATALOG.length);
  });

  it("retrieves the golden-hour study from natural-language terms", () => {
    const results = retrieveCinematicLooks("golden hour warm sunset", 3);
    expect(results[0]?.id).toBe("warm-golden-hour");
  });

  it("expands Portuguese scene language into useful matches", () => {
    expect(retrieveCinematicLooks("chuva rua noturna", 3)[0]?.id).toBe("rain-soaked-noir");
    expect(retrieveCinematicLooks("retrato luz de janela", 3).some((look) => look.id === "window-light-portrait")).toBe(true);
  });

  it("uses film references and scene metadata in retrieval", () => {
    expect(retrieveCinematicLooks("Blade Runner 2049 fog cyan", 4).some((look) => look.id === "fog-diffusion")).toBe(true);
    expect(retrieveCinematicLooks("food restaurant warm", 4).some((look) => look.id === "food-warm-natural")).toBe(true);
  });

  it("does not return irrelevant records for an unknown query", () => {
    expect(retrieveCinematicLooks("qzxv unknown vocabulary", 4)).toEqual([]);
  });

  it("returns no more than the requested number of looks and handles invalid limits", () => {
    expect(retrieveCinematicLooks("cinematic night city", 2)).toHaveLength(2);
    expect(retrieveCinematicLooks("cinematic night city", 0)).toEqual([]);
    expect(retrieveCinematicLooks("cinematic night city", -1)).toEqual([]);
  });

  it("keeps every catalog bias inside the renderer's supported adjustment contract", () => {
    for (const look of CINEMATIC_CATALOG) {
      expect(AdjustmentSchema.safeParse({ ...DEFAULT_ADJUSTMENT, ...look.globalBias }).success, look.id).toBe(true);
    }
  });

  it("provides provenance notes and implementation cautions for every reference recipe", () => {
    for (const look of CINEMATIC_CATALOG) {
      expect(look.caution.length, look.id).toBeGreaterThan(10);
      expect(look.implementationNote.length, look.id).toBeGreaterThan(10);
      for (const reference of look.referenceWorks) {
        expect(reference.title.length, look.id).toBeGreaterThan(2);
        expect(reference.year, look.id).toBeGreaterThan(1900);
        expect(reference.note.length, look.id).toBeGreaterThan(5);
      }
    }
  });
});
