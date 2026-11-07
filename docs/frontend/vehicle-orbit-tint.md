# Vehicle turn and the bundled orbit fallback

## Owner-image turn (R2)

The R2 turn on the Now page and in the vehicle snapshot (`RVehicleStage`) uses only the owner's own Rivian images. The images come from Rivian `getVehicleMobileImages` and reach the app as `vehicle.images`.

- `resolveVehicleArtwork(images, model, 'vehicle-card').angles` holds one angle set per design (`light`, `dark`). `resolveVehicleAngleSet` in `packages/hooks/src/vehicleArtworkFallback.ts` builds each set.
- Turning order: front, front three-quarter, side, rear three-quarter, rear. Overhead, charging and unknown placements are not turn angles. The set holds only placements that exist, at most one image per angle.
- One set uses one design and one art style (Rivian sends a photo set and a cel set; `metadata.source` names the style). The design that matches the theme wins. The other design is used only when the theme design has no turn image. When `images.all` is empty, the typed `front`, `side` and `rear` pairs are used.
- `RVehicleAngles` (in `RVehicleOrbit.tsx`) is the turn control. The car rests on the side image. A drag or the arrow keys step through the set with a 180 ms opacity cross-fade. A released drag rounds to the nearest angle, with at most one step of inertia. The set wraps around. A double-tap or Home returns to the side image. End goes to the last angle. Reduced motion shows each angle at once: no fade, no inertia.
- The control is a slider. Its label is "Your R2, <colour>. Use arrow keys to turn." and `aria-valuetext` names the angle, for example "Front three-quarter". There is no hint text and nothing is drawn over the car.
- With fewer than two owner images, the car area shows one image (the owner side image, else the packaged R2 artwork) with no turn control.
- An R2 never shows the bundled orbit frames, the orbit poster or the orbit canvas.

## Bundled orbit (fallback)

The bundled orbit is a fallback for models without owner images. It is not used for an R2, because its frames show an R1S body (see Known limits). No current route renders it: every model without a turn set shows one static image. The rest of this page describes the fallback.

The orbit uses 72 bundled frames of one vehicle in one paint (teal). The frames can show the owner's paint instead. The paint comes from the owner's Rivian side artwork.

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

- A caller gives `RVehicleOrbit` the owner artwork URL as `paintSource`.
- `loadArtworkPaint` reads that image on a canvas. It takes the dominant body colour: opaque pixels in the door band, without near-black glass and tyres and without the brightest 5 % (highlights).
- `createOrbitFrames().setPaint(paint)` loads the mask pack once and tints each decoded frame on a canvas. The tinted frame is cached like an untinted frame. A paint change drops the cache and redraws the frame on screen.
- `tintPixels` works in OKLab. Lightness follows a tone curve that maps the body reference onto the paint lightness and keeps the shading. Chroma and hue take the paint values plus 35 % of the pixel deviation from the teal reference. Full deviation would magnify the WebP chroma blocks on saturated paints.
- The frames stay untinted when there is no artwork, no paint can be sampled, the mask pack fails to load, or no canvas is available.

## Known limits

- The bundled frames show an R1S body, not an R2: the beltline is straight, the rear quarter window has no rise and there are no roof rails. Compare frame 12 with `apps/web/public/vehicle-images/fallbacks/r2s/side.webp`. The tint changes only the paint.
- The black roof, the cladding and the wheels keep their bundled look.
