import type { Adjustment, EditPlan } from "./schema";
import { getOutputDimensions, transformRgb } from "./math";

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function luma8(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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

function applyGlobalAdjustments(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  adjustment: Adjustment,
): void {
  const tileSize = 512;
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const tileWidth = Math.min(tileSize, width - x);
      const tileHeight = Math.min(tileSize, height - y);
      const frame = context.getImageData(x, y, tileWidth, tileHeight);
      const pixels = frame.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = transformRgb(pixels[i], pixels[i + 1], pixels[i + 2], adjustment);
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
      }
      context.putImageData(frame, x, y);
    }
  }
}

/** A small edge-aware cross bilateral pass; tiled to bound temporary memory. */
function applyDenoise(context: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
  if (strength <= 0.01) return;
  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;
  const snapshotContext = snapshot.getContext("2d", { willReadFrequently: true });
  if (!snapshotContext) throw new Error("Não foi possível preparar a redução de ruído.");
  snapshotContext.drawImage(context.canvas, 0, 0);

  const tileSize = 384;
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const tileWidth = Math.min(tileSize, width - x);
      const tileHeight = Math.min(tileSize, height - y);
      const sourceX = Math.max(0, x - 1);
      const sourceY = Math.max(0, y - 1);
      const sourceRight = Math.min(width, x + tileWidth + 1);
      const sourceBottom = Math.min(height, y + tileHeight + 1);
      const sourceWidth = sourceRight - sourceX;
      const sourceHeight = sourceBottom - sourceY;
      const source = snapshotContext.getImageData(sourceX, sourceY, sourceWidth, sourceHeight);
      const output = context.createImageData(tileWidth, tileHeight);

      for (let py = 0; py < tileHeight; py += 1) {
        for (let px = 0; px < tileWidth; px += 1) {
          const sx = x + px - sourceX;
          const sy = y + py - sourceY;
          const centerIndex = (sy * sourceWidth + sx) * 4;
          const centerR = source.data[centerIndex];
          const centerG = source.data[centerIndex + 1];
          const centerB = source.data[centerIndex + 2];
          const centerLuma = luma8(centerR, centerG, centerB);
          let weightSum = 1;
          let redSum = centerR;
          let greenSum = centerG;
          let blueSum = centerB;

          for (const [dx, dy] of neighbors) {
            const nx = sx + dx;
            const ny = sy + dy;
            if (nx < 0 || ny < 0 || nx >= sourceWidth || ny >= sourceHeight) continue;
            const index = (ny * sourceWidth + nx) * 4;
            const difference = Math.abs(luma8(source.data[index], source.data[index + 1], source.data[index + 2]) - centerLuma);
            const weight = Math.exp(-difference / 24);
            weightSum += weight;
            redSum += source.data[index] * weight;
            greenSum += source.data[index + 1] * weight;
            blueSum += source.data[index + 2] * weight;
          }

          const averageR = redSum / weightSum;
          const averageG = greenSum / weightSum;
          const averageB = blueSum / weightSum;
          const outputIndex = (py * tileWidth + px) * 4;
          output.data[outputIndex] = clamp(centerR * (1 - strength) + averageR * strength);
          output.data[outputIndex + 1] = clamp(centerG * (1 - strength) + averageG * strength);
          output.data[outputIndex + 2] = clamp(centerB * (1 - strength) + averageB * strength);
          output.data[outputIndex + 3] = source.data[centerIndex + 3];
        }
      }
      context.putImageData(output, x, y);
    }
  }
}

/** Local contrast and edge sharpening via tiled unsharp masks, without full-frame scratch buffers. */
function applyDetailEnhancement(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  clarity: number,
  sharpen: number,
): void {
  if (clarity <= 0.01 && sharpen <= 0.01) return;

  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;
  const snapshotContext = snapshot.getContext("2d");
  if (!snapshotContext) throw new Error("Não foi possível preparar a nitidez.");
  snapshotContext.drawImage(context.canvas, 0, 0);

  const tileSize = 320;
  const pad = 16;
  const tile = document.createElement("canvas");
  const tileContext = tile.getContext("2d", { willReadFrequently: true });
  const fineBlur = document.createElement("canvas");
  const fineContext = fineBlur.getContext("2d", { willReadFrequently: true });
  const broadBlur = document.createElement("canvas");
  const broadContext = broadBlur.getContext("2d", { willReadFrequently: true });
  if (!tileContext || !fineContext || !broadContext) throw new Error("Canvas indisponível para nitidez.");

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const tileWidth = Math.min(tileSize, width - x);
      const tileHeight = Math.min(tileSize, height - y);
      const sourceX = Math.max(0, x - pad);
      const sourceY = Math.max(0, y - pad);
      const sourceRight = Math.min(width, x + tileWidth + pad);
      const sourceBottom = Math.min(height, y + tileHeight + pad);
      const sourceWidth = sourceRight - sourceX;
      const sourceHeight = sourceBottom - sourceY;

      for (const canvas of [tile, fineBlur, broadBlur]) {
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
      }
      tileContext.filter = "none";
      tileContext.drawImage(snapshot, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      fineContext.clearRect(0, 0, sourceWidth, sourceHeight);
      fineContext.filter = "blur(1.15px)";
      fineContext.drawImage(tile, 0, 0);
      broadContext.clearRect(0, 0, sourceWidth, sourceHeight);
      broadContext.filter = "blur(5px)";
      broadContext.drawImage(tile, 0, 0);

      const base = tileContext.getImageData(0, 0, sourceWidth, sourceHeight);
      const fine = fineContext.getImageData(0, 0, sourceWidth, sourceHeight);
      const broad = broadContext.getImageData(0, 0, sourceWidth, sourceHeight);
      const output = context.createImageData(tileWidth, tileHeight);
      const offsetX = x - sourceX;
      const offsetY = y - sourceY;

      for (let py = 0; py < tileHeight; py += 1) {
        for (let px = 0; px < tileWidth; px += 1) {
          const sourceIndex = ((py + offsetY) * sourceWidth + px + offsetX) * 4;
          const outputIndex = (py * tileWidth + px) * 4;
          const baseR = base.data[sourceIndex];
          const baseG = base.data[sourceIndex + 1];
          const baseB = base.data[sourceIndex + 2];
          const fineDetail = luma8(baseR, baseG, baseB) - luma8(
            fine.data[sourceIndex], fine.data[sourceIndex + 1], fine.data[sourceIndex + 2],
          );
          const broadDetail = luma8(baseR, baseG, baseB) - luma8(
            broad.data[sourceIndex], broad.data[sourceIndex + 1], broad.data[sourceIndex + 2],
          );
          const correction = clamp(
            fineDetail * sharpen * 1.05 + broadDetail * clarity * 0.42,
            -20,
            20,
          );
          output.data[outputIndex] = clamp(baseR + correction);
          output.data[outputIndex + 1] = clamp(baseG + correction);
          output.data[outputIndex + 2] = clamp(baseB + correction);
          output.data[outputIndex + 3] = base.data[sourceIndex + 3];
        }
      }
      context.putImageData(output, x, y);
    }
  }
}

function applyVignette(context: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
  if (strength <= 0.005) return;
  const centerX = width / 2;
  const centerY = height / 2;
  const gradient = context.createRadialGradient(
    centerX, centerY, Math.min(width, height) * 0.18,
    centerX, centerY, Math.max(width, height) * 0.76,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.68, `rgba(0,0,0,${strength * 0.18})`);
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

export async function applyEditPlan(source: string, plan: EditPlan): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  const sourcePixels = image.naturalWidth * image.naturalHeight;
  if (sourcePixels > 24_000_000) {
    throw new Error("A imagem excede o limite inicial de 24 megapixels para processamento no navegador.");
  }

  const dimensions = getOutputDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D não está disponível neste navegador.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Denoise before tonal/detail enhancement to reduce sharpening of sensor/compression noise.
  applyDenoise(context, canvas.width, canvas.height, plan.quality.denoise);

  applyGlobalAdjustments(context, canvas.width, canvas.height, plan.global);

  // Semantic contours remain internal. Each revision is rendered from the immutable original.
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
      const [r, g, b] = transformRgb(data[i], data[i + 1], data[i + 2], region.adjustments);
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

  applyDetailEnhancement(context, canvas.width, canvas.height, plan.quality.clarity, plan.quality.sharpen);
  applyVignette(context, canvas.width, canvas.height, plan.quality.vignette);

  return canvas.toDataURL("image/png");
}
