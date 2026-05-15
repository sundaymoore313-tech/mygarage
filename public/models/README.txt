Car Model Library (GLB)

This folder is scanned automatically and every .glb/.gltf file is added to /models/manifest.json.

Recommended layout:
- /models/<year_make_model>.glb
- /models/home/hero.glb (homepage hero model)

Examples:
- /models/2020_dodge_challenger_srt_super_stock.glb
- /models/2019_chevrolet_corvette_c8_stingray.glb
- /models/ferrari_f8_tributo_threejs.glb

Quality checklist (real car models):
1) Use centered models near world origin before export.
2) Keep car resting at ground level in Blender before GLB export.
3) Prefer a single paintable body mesh, separate glass, separate rims.
4) Avoid extremely dense meshes that hurt editor FPS.
5) Ensure textures are embedded or copied with the model package.

Readable mesh naming for paint/classify workflows:
- body_main, body_secondary
- hood
- roof
- front_bumper, rear_bumper
- fender_fl, fender_fr, fender_rl, fender_rr
- door_fl, door_fr, door_rl, door_rr
- side_skirt_l, side_skirt_r
- trunk_or_hatch
- glass_windshield, glass_rear, glass_side
- rim_fl, rim_fr, rim_rl, rim_rr
- tire_fl, tire_fr, tire_rl, tire_rr

Hood and rims best practice:
- Keep hood as its own mesh for independent decals/print targeting.
- Keep each rim as its own mesh so rim paint is predictable.
- Do not merge rim + tire + brake into one mesh unless required.

Manifest generation:
- Run: node scripts/generate-cars-manifest.mjs

If no model is selected in app flow, the placeholder can still appear depending on route/state.
