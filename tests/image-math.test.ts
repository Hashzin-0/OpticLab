import { describe, expect, it } from "vitest";
import { getOutputDimensions, linearToSrgb, srgbToLinear, transformRgb } from "../lib/editing/math";
import { DEFAULT_ADJUSTMENT } from "../lib/editing/schema";

describe("linear-light image math", () => {
  it("round-trips representative sRGB values", () => {
    for (const channel of [0, 12, 32, 64, 128, 192, 255]) {
      expect(Math.abs(linearToSrgb(srgbToLinear(channel)) - channel)).toBeLessThanOrEqual(1);
    }
  });

  it("increases luminance when positive exposure is applied", () => {
    const input = [90, 110, 130] as const;
    const output = transformRgb(...input, { ...DEFAULT_ADJUSTMENT, exposureEv: 1 });
    expect(output[0]).toBeGreaterThan(input[0]);
    expect(output[1]).toBeGreaterThan(input[1]);
    expect(output[2]).toBeGreaterThan(input[2]);
  });

  it("applies vibrance more strongly to a muted color than to a saturated color", () => {
    const muted = transformRgb(128, 120, 120, { ...DEFAULT_ADJUSTMENT, vibrance: 0.6 });
    const vivid = transformRgb(220, 30, 30, { ...DEFAULT_ADJUSTMENT, vibrance: 0.6 });
    const mutedChange = Math.abs(muted[0] - muted[1]);
    const vividChange = Math.abs(vivid[0] - vivid[1]);
    expect(mutedChange / Math.abs(128 - 120)).toBeGreaterThan(vividChange / Math.abs(220 - 30));
  });

  it("upscales to a 1920px long edge without cropping or distorting aspect ratio", () => {
    expect(getOutputDimensions(1280, 720)).toEqual({ width: 1920, height: 1080, upscaled: true });
    expect(getOutputDimensions(600, 900)).toEqual({ width: 1280, height: 1920, upscaled: true });
  });

  it("does not downscale images already larger than the target edge", () => {
    expect(getOutputDimensions(4000, 3000)).toEqual({ width: 4000, height: 3000, upscaled: false });
  });

  it("rejects invalid dimensions", () => {
    expect(() => getOutputDimensions(0, 100)).toThrow(/inválidas/);
  });
});
