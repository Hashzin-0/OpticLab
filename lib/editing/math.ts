import type { Adjustment } from "./schema";

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

export function srgbToLinear(channel: number): number {
  const value = clamp(channel / 255);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(channel: number): number {
  const value = clamp(channel);
  const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(clamp(encoded) * 255);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function luminanceLinear(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Color and tonal operations are performed in linear-light RGB, then encoded to sRGB. */
export function transformRgb(r: number, g: number, b: number, adjustment: Adjustment): [number, number, number] {
  const exposure = 2 ** adjustment.exposureEv;
  let red = srgbToLinear(r) * exposure;
  let green = srgbToLinear(g) * exposure;
  let blue = srgbToLinear(b) * exposure;

  const luma = luminanceLinear(red, green, blue);
  const shadowWeight = 1 - smoothstep(0.015, 0.32, luma);
  const highlightWeight = smoothstep(0.52, 0.98, luma);
  const tonalLift = adjustment.shadows * 0.16 * shadowWeight - adjustment.highlights * 0.12 * highlightWeight;
  red += tonalLift;
  green += tonalLift;
  blue += tonalLift;

  const pivot = 0.18;
  red = (red - pivot) * adjustment.contrast + pivot;
  green = (green - pivot) * adjustment.contrast + pivot;
  blue = (blue - pivot) * adjustment.contrast + pivot;

  red *= 1 + adjustment.warmth * 0.42;
  blue *= 1 - adjustment.warmth * 0.42;

  const gray = luminanceLinear(red, green, blue);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum > 0 ? (maximum - minimum) / maximum : 0;
  const vibranceGain = 1 + adjustment.vibrance * (1 - chroma);
  const saturationGain = adjustment.saturation * vibranceGain;
  red = gray + (red - gray) * saturationGain;
  green = gray + (green - gray) * saturationGain;
  blue = gray + (blue - gray) * saturationGain;

  return [linearToSrgb(red), linearToSrgb(green), linearToSrgb(blue)];
}

export interface OutputDimensions {
  width: number;
  height: number;
  upscaled: boolean;
}

/** Upscales to a 1920px long edge without cropping or changing aspect ratio. */
export function getOutputDimensions(width: number, height: number, targetLongEdge = 1920): OutputDimensions {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Dimensões de imagem inválidas.");
  }
  const currentLongEdge = Math.max(width, height);
  const scale = Math.max(1, targetLongEdge / currentLongEdge);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    upscaled: scale > 1,
  };
}
