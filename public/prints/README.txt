Drop print/pattern image files here (PNG, JPG, JPEG, WEBP).

These images will be tiled as repeating textures across the car's painted surfaces —
just like a base paint coat, but using a pattern/photograph instead of a solid colour.

Examples of what works well:
  - Camouflage patterns (military, digital, urban)
  - Carbon fibre weaves
  - Brushed metal textures
  - Racing checkered or houndstooth patterns
  - Custom vinyl print designs (seamlessly tileable)

After adding images, the manifest is regenerated automatically when you run:
  npm run dev   (via the predev hook)
  npm run build (via the prebuild hook)

Or regenerate manually with:
  node scripts/generate-prints-manifest.mjs
