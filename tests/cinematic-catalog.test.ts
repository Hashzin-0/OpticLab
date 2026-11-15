import { describe, expect, it } from "vitest";
import { retrieveCinematicLooks } from "../lib/cinematic/catalog";

describe("cinematic look retrieval", () => {
  it("retrieves a relevant authored look from natural-language terms", () => {
    const results = retrieveCinematicLooks("golden hour warm sunset", 3);
    expect(results[0]?.id).toBe("warm-golden-hour");
  });

  it("returns no more than the requested number of looks", () => {
    expect(retrieveCinematicLooks("cinematic light color", 2)).toHaveLength(2);
  });
});
