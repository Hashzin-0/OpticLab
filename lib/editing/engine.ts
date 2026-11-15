import type { Adjustment, EditPlan } from "./schema";

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function transformPixel(r: number, g: number, b: number, a: Adjustment, x: number, y: number): [number, number, number] {
  const exposure = 2 ** a.exposureEv;
  let nr = r * exposure;
  let ng = g * exposure;
  let nb = b * exposure;

  const luma = luminance(nr, ng, nb);
  const shadowWeight = 1 - smoothstep(28, 150, luma);
  const highlightWeight = smoothstep(150, 238, luma);
  const tonalLift = a.shadows * 54 * shadowWeight - a.highlights * 48 * highlightWeight;
  nr += tonalLift; ng += tonalLift; nb += tonalLift;

  const center = 128;
  nr = (nr - center) * a.contrast + center;
  ng = (ng - center) * a.contrast + center;
  nb = (nb - center) * a.contrast + center;

  const gray = luminance(nr, ng, nb);
  nr = gray + (nr - gray) * a.saturation;
  ng = gray + (ng - gray) * a.saturation;
  nb = gray + (nb - gray) * a.saturation;

  // Warmth is a restrained white-balance-like channel offset, not a physical RAW WB reconstruction.
  nr += a.warmth * 42;
  nb -= a.warmth * 42;

  return [clamp(nr), clamp(ng), clamp(nb)];
}

export async function applyEditPlan(source: string, plan: EditPlan): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D não está disponível neste navegador.");

  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  const global = plan.global;

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = transformPixel(pixels[i], pixels[i + 1], pixels[i + 2], global, 0, 0);
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  }
  context.putImageData(frame, 0, 0);

  // Each region becomes a feathered mask. The same plan is replayed from the original every time.
  for (const region of plan.regions) {
    const x = Math.round(region.bounds.x * canvas.width);
    const y = Math.round(region.bounds.y * canvas.height);
    const width = Math.max(1, Math.min(canvas.width - x, Math.round(region.bounds.width * canvas.width)));
    const height = Math.max(1, Math.min(canvas.height - y, Math.round(region.bounds.height * canvas.height)));
    const featherPx = Math.max(1, Math.round(Math.min(width, height) * region.feather));
    const regionFrame = context.getImageData(x, y, width, height);
    const data = regionFrame.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const edge = Math.min(px, py, width - 1 - px, height - 1 - py);
        const alpha = smoothstep(0, featherPx, edge);
        if (alpha <= 0) continue;
        const index = (py * width + px) * 4;
        const [r, g, b] = transformPixel(data[index], data[index + 1], data[index + 2], region.adjustments, px, py);
        data[index] = data[index] * (1 - alpha) + r * alpha;
        data[index + 1] = data[index + 1] * (1 - alpha) + g * alpha;
        data[index + 2] = data[index + 2] * (1 - alpha) + b * alpha;
      }
    }
    context.putImageData(regionFrame, x, y);

    if (region.adjustments.blur > 0) {
      const blurred = document.createElement("canvas");
      blurred.width = width; blurred.height = height;
      const blurredContext = blurred.getContext("2d");
      if (blurredContext) {
        blurredContext.filter = `blur(${region.adjustments.blur}px)`;
        blurredContext.drawImage(canvas, x, y, width, height, 0, 0, width, height);
        context.save();
        context.beginPath();
        context.rect(x, y, width, height);
        context.clip();
        context.globalAlpha = 0.35;
        context.drawImage(blurred, x, y);
        context.restore();
      }
    }
  }

  return canvas.toDataURL("image/png");
}