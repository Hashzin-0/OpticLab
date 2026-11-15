# Image quality and resolution pipeline

## Purpose

The quality stage exists to move beyond small exposure/saturation tweaks. Gemini diagnoses the photograph and selects bounded operations; the browser applies deterministic image transforms. No generated pixels, replacement subjects, or generative fill are used.

## Operations

### Linear-light color and tone

The renderer decodes sRGB channel values into linear-light values before applying exposure, tonal lift, contrast, warmth, saturation, and vibrance. It then encodes the result back to sRGB. This avoids treating gamma-encoded display values as if they were linear light.

### Edge-aware denoising

A compact cross-bilateral approximation compares each pixel with its four direct neighbors. Neighbor contributions are weighted by luminance similarity, so strong edges are less likely to be averaged across. The pass is tiled to bound temporary memory and runs only when Gemini identifies noise that warrants reduction.

This is a lightweight deterministic filter, not a replacement for non-local means, RAW-domain denoising, or a neural denoiser. Strong settings can still remove fine texture; the schema keeps the range conservative.

### Clarity and sharpening

Tiled unsharp-mask passes compare the source tile with a softly blurred version and a broader local blur. The high-frequency difference contributes to edge acutance; the broader difference contributes to local contrast. Tile padding avoids seams at boundaries, and correction is clamped to reduce halos.

Sharpening increases perceived edge definition. It does not recover real detail lost to defocus, motion blur, compression, or low sensor resolution.

### Output enlargement

When the source long edge is below 1920 pixels, Canvas draws it to a 1920px long edge using image smoothing set to high quality. The aspect ratio is preserved; no crop or forced 16:9 canvas is introduced. Sources already larger than 1920px are not downscaled.

The browser API's `imageSmoothingQuality` setting is not uniformly supported, so actual resampling quality may vary by browser. Enlargement is interpolation, not super-resolution. It cannot invent authentic texture or restore information that the sensor never captured.

### Vignette

A radial gradient applies a bounded edge darkening when composition analysis indicates that it helps direct attention. It is optional and intentionally conservative.

## Refinement behavior

The first Gemini response is a complete plan. A follow-up response is a typed delta with only changed absolute values. The server merges the delta into the accumulated plan, preserving untouched settings and semantic regions. The renderer then recomposes from the original image. This keeps the user-visible edit cumulative without repeatedly resampling or compressing the previous PNG.

## Known limits

- No neural super-resolution or hallucinated detail generation.
- No RAW decoding, demosaicing, camera profiles, or lens-specific calibration.
- No full professional color-management pipeline or ACES transform.
- No dedicated non-local means denoiser; the current denoise pass is intentionally lightweight.
- No frequency-domain deconvolution for motion blur or defocus.
- Canvas resampling behavior depends partly on browser implementation.
- No EXIF preservation guarantee in the PNG output.
- Gemini's noise, sharpness, and segmentation judgments may be imperfect and require future image-based QA.

## Technical references

- W3C CSS Color 4: linear-light sRGB transfer functions and color-space definitions — https://www.w3.org/TR/css-color-4/
- MDN Canvas `imageSmoothingQuality`: browser-supported high-quality image smoothing; support is not universal — https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality
- MDN Canvas `imageSmoothingEnabled`: smoothing behavior during scaling — https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled
- OpenCV image filtering reference: bilateral filtering preserves edges better than simple smoothing but can be computationally expensive — https://docs.opencv.org/4.13.0/javadoc/org/opencv/imgproc/Imgproc.html
- OpenCV denoising reference: non-local means trades denoising strength against detail preservation — https://docs.opencv.org/5.0/main_modules/photo_denoise.html
- OpenCV CLAHE reference: local histogram equalization uses contrast limiting and interpolation to reduce tile artifacts — https://docs.opencv.org/4.13.0/d5/daf/tutorial_py_histogram_equalization.html

These references justify algorithmic choices and limitations; they are not claims that OpticLab implements OpenCV or CLAHE.
