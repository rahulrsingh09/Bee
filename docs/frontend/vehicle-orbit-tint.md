# Vehicle orbit paint tint

The 360° turn on the Now page uses 72 bundled frames of one vehicle in one paint (teal). The frames show the owner's paint instead. The paint comes from the owner's Rivian side artwork.

## Assets

| File | Content |
| --- | --- |
| `apps/web/src/features/r-experience/assets/r2-orbit.bin` and `.json` | 72 WebP frames, 840 × 430 px, and their `[offset, length]` index. |
| `apps/web/src/features/r-experience/assets/r2-orbit-mask.bin` and `.json` | One 8-bit greyscale PNG body mask per frame, cropped to its bounding box, and the index `[offset, length, x, y, width, height]`. The index also holds the OKLab body reference of the rest frame (56). |

`scripts/build-orbit-masks.mjs` builds the mask pack offline from the frames. The build is deterministic:

1. Select opaque pixels in the OKLab hue and chroma band of the teal paint (hue 200°–250°, chroma from 0.02). Glass, tyres and trim are near neutral and drop out.
2. Close seams, open specks, remove small islands and fill small holes. Lamps and amber markers of a different hue stay out.
3. Snap the edge to the full-resolution lightness with a guided filter, because WebP keeps chroma at half resolution. Feather the edge and multiply by the frame alpha.

The script needs `ffmpeg` on `PATH`. The pack must stay at or below 1.5 MB (currently about 0.85 MB). Rebuild the pack when the frames change:

```bash
node scripts/build-orbit-masks.mjs
node scripts/build-orbit-masks.mjs --check <dir>   # tint frame 56 to the r2s fallback paint, report ΔE, write PNGs
```

## Runtime

- `NowCar` gives `RVehicleOrbit` the owner artwork URL as `paintSource`.
- `loadArtworkPaint` reads that image on a canvas. It takes the dominant body colour: opaque pixels in the door band, without near-black glass and tyres and without the brightest 5 % (highlights).
- `createOrbitFrames().setPaint(paint)` loads the mask pack once and tints each decoded frame on a canvas. The tinted frame is cached like an untinted frame. A paint change drops the cache and redraws the frame on screen.
- `tintPixels` works in OKLab. Lightness follows a tone curve that maps the body reference onto the paint lightness and keeps the shading. Chroma and hue take the paint values plus 35 % of the pixel deviation from the teal reference. Full deviation would magnify the WebP chroma blocks on saturated paints.
- The frames stay untinted when there is no artwork, no paint can be sampled, the mask pack fails to load, or no canvas is available.

## Known limits

- The bundled frames show an R1S body, not an R2: the beltline is straight, the rear quarter window has no rise and there are no roof rails. Compare frame 12 with `apps/web/public/vehicle-images/fallbacks/r2s/side.webp`. The tint changes only the paint.
- The black roof, the cladding and the wheels keep their bundled look.
