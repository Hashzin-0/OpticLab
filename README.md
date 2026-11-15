# OpticLab

Autonomous computational photography. Upload a photo; OpticLab analyzes it, builds a validated edit plan, applies deterministic image processing and returns a finished image. Users can request natural-language refinements without operating manual editing controls.

## Product principle

**One user-facing engine, one automated workflow.** Internal algorithms are implementation details coordinated by a single orchestration pipeline. This is not a traditional manual photo editor.

Gemini analyzes the image and translates user intent into a typed edit plan. It does not generate, repaint, or replace the photograph. Pixel changes are performed by deterministic, testable image operations. Semantic masks are generated automatically and used internally; users do not need to paint or manage masks.

## Current status

The initial application, Gemini analysis endpoint, deterministic browser renderer, Gemini contour segmentation and feathered internal masks, and cinematic look catalog foundation are present on the development branch. This is an early MVP: production-grade segmentation, optical calibration, denoising, RAW decoding, catalog-scale retrieval, rate limiting, and persistence are not implemented yet. See `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.

## Development

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
```

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`. Never commit secrets.

## Safety and fidelity

- Preserve the uploaded original.
- Never claim to recover clipped highlights, missing detail, true shutter speed, or real lens metadata when they were not captured.
- Validate every model-produced parameter against application-owned schemas and bounds.
- No generative image editing in the correction pipeline.
- Keep every revision reproducible from the original plus its edit plan.
