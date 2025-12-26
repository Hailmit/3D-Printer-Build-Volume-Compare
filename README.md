# 3D Printer Build Volume Compare

Static Three.js viewer to compare 3D printer build volumes at true millimeter scale. Load preset printers from `data/printers.json` or add your own dimensions, toggle visibility, and inspect everything in one shared coordinate system.

## Features
- Z-up scene; 1 Three.js unit = 1 mm.
- Translucent solids + outlines for multiple printers at once.
- Orbit controls with orientation gizmo; snap views (Top/Front/Side) flatten boxes for easy footprint comparison.
- Toggle axes and Benchy reference; change Benchy color; Benchy always sits at the smallest visible printer's center.
- Hover labels to highlight corresponding printer; labels offset to avoid overlap.
- Search/filter list and checkbox toggles.
- Add custom printer dimensions (name + X/Y/Z + color); duplicates by name are replaced and show immediately.
- Alignment modes: center overlap, corner overlap, or row (sorted small → large with X offset) with auto recentering of grid/camera.
- Sidebar collapse toggle; settings gear for axes/Benchy/color/align.

## Files
- `index.html` — layout, styles, sidebar, settings, gizmo hook.
- `scripts/main.js` — Three.js scene, alignment/flatten, toggles, custom-add form, highlighting, Benchy STL loader, camera/grid logic.
- `styles/style.css` — all styling.
- `data/printers.json` — grouped printer specs (brand/name/dimensions/color).
- `assets/3DBenchy.stl` — reference model used for scale.

## Usage
1) Serve the folder (e.g., `python -m http.server 8000`) and open in a modern browser.
2) Gear menu: toggle axes/Benchy, pick Benchy color, choose align mode; sidebar toggle hides/shows controls.
3) Search or tick printers to show/hide; add custom sizes via the form (replaces same-name entries).
4) Click gizmo labels to snap views; drag to orbit. Hover labels to emphasize a printer.
