import type { Adjustment, EditPlan } from "./schema";

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function transformPixel(r: number, g: number, b: number, a: Adjustment): [number, number, number] {
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

  // Approximate warmth adjustment in display-referred RGB, not RAW white-balance reconstruction.
  nr += a.warmth * 42;
  nb -= a.warmth * 42;

  return [clamp(nr), clamp(ng), clamp(nb)];
}

function buildFeatheredMask(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  originX: number,
  originY: number,
  points: number[][],
  featherPx: number,
): ImageData {
  const shape = document.createElement("canvas");
  shape.width = width;
  shape.height = height;
  const shapeContext = shape.getContext("2d");
  if (!shapeContext) throw new Error("Não foi possível construir a máscara.");

  shapeContext.beginPath();
  points.forEach(([normalizedX, normalizedY], index) => {
    const x = (normalizedX / 1000) * imageWidth - originX;
    const y = (normalizedY / 1000) * imageHeight - originY;
    if (index === 0) shapeContext.moveTo(x, y);
    else shapeContext.lineTo(x, y);
  });
  shapeContext.closePath();
  shapeContext.fillStyle = "#fff";
  shapeContext.fill();

  const feathered = document.createElement("canvas");
  feathered.width = width;
  feathered.height = height;
  const featherContext = feathered.getContext("2d", { willReadFrequently: true });
  if (!featherContext) throw new Error("Não foi possível suavizar a máscara.");
  featherContext.filter = `blur(${featherPx}px)`;
  featherContext.drawImage(shape, 0, 0);
  return featherContext.getImageData(0, 0, width, height);
}

export async function applyEditPlan(source: string, plan: EditPlan): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > 24_000_000) {
    throw new Error("A imagem excede o limite inicial de 24 megapixels para processamento no navegador.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D não está disponível neste navegador.");

  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = transformPixel(pixels[i], pixels[i + 1], pixels[i + 2], plan.global);
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  }
  context.putImageData(frame, 0, 0);

  // Segmentation contours are generated automatically by Gemini and never exposed as manual tools.
  for (const region of plan.regions) {
    const [yMin, xMin, yMax, xMax] = region.box_2d;
    const boxX = Math.floor((xMin / 1000) * canvas.width);
    const boxY = Math.floor((yMin / 1000) * canvas.height);
    const boxRight = Math.ceil((xMax / 1000) * canvas.width);
    const boxBottom = Math.ceil((yMax / 1000) * canvas.height);
    const boxWidth = Math.max(1, boxRight - boxX);
    const boxHeight = Math.max(1, boxBottom - boxY);
    const featherPx = Math.max(1, Math.round(Math.min(boxWidth, boxHeight) * region.feather));
    const pad = featherPx * 2;
    const x = Math.max(0, boxX - pad);
    const y = Math.max(0, boxY - pad);
    const right = Math.min(canvas.width, boxRight + pad);
    const bottom = Math.min(canvas.height, boxBottom + pad);
    const width = Math.max(1, right - x);
    const height = Math.max(1, bottom - y);

    const maskFrame = buildFeatheredMask(width, height, canvas.width, canvas.height, x, y, region.mask, featherPx);
    const mask = maskFrame.data;
    const regionFrame = context.getImageData(x, y, width, height);
    const data = regionFrame.data;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = mask[i + 3] / 255;
      if (alpha <= 0) continue;
      const [r, g, b] = transformPixel(data[i], data[i + 1], data[i + 2], region.adjustments);
      data[i] = data[i] * (1 - alpha) + r * alpha;
      data[i + 1] = data[i + 1] * (1 - alpha) + g * alpha;
      data[i + 2] = data[i + 2] * (1 - alpha) + b * alpha;
    }

    if (region.adjustments.blur > 0) {
      const sourceRegion = document.createElement("canvas");
      sourceRegion.width = width;
      sourceRegion.height = height;
      const sourceContext = sourceRegion.getContext("2d");
      const blurredRegion = document.createElement("canvas");
      blurredRegion.width = width;
      blurredRegion.height = height;
      const blurredContext = blurredRegion.getContext("2d", { willReadFrequently: true });

      if (sourceContext && blurredContext) {
        sourceContext.putImageData(regionFrame, 0, 0);
        blurredContext.filter = `blur(${region.adjustments.blur}px)`;
        blurredContext.drawImage(sourceRegion, 0, 0);
        const blurred = blurredContext.getImageData(0, 0, width, height).data;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = (mask[i + 3] / 255) * 0.35;
          data[i] = data[i] * (1 - alpha) + blurred[i] * alpha;
          data[i + 1] = data[i + 1] * (1 - alpha) + blurred[i + 1] * alpha;
          data[i + 2] = data[i + 2] * (1 - alpha) + blurred[i + 2] * alpha;
        }
      }
    }
    context.putImageData(regionFrame, x, y);
  }

  return canvas.toDataURL("image/png");
}
