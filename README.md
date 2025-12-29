# 3D Printer Build Volume Compare

Static Three.js viewer to compare 3D printer build volumes at true millimeter scale. Data lives in `data/printers.json`; toggle any printer or add your own dimensions directly in the UI. Benchy/Voron reference models are bundled.

## Features
- Z-up scene; 1 Three.js unit = 1 mm; boxes rest on the build plate in the same world space.
- Translucent solids + outlines for multiple printers; labels and tooltips show name, dimensions, and volume.
- 2D/3D views: top-view button flattens boxes with anti-overlap labels; scroll in 2D returns to 3D. Orientation gizmo for snap views.
- Settings gear: axes toggle, Benchy toggle/color, sample model (Benchy/Voron cube), alignment mode (center overlap, corner overlap, row sorted small→large).
- Responsive UI: sidebar overlay on mobile/tablet, collapsible custom form, help modal instead of alerts, vertical control stack on the viewport.
- Custom printers: name + X/Y/Z + color; same-name entries are replaced and shown immediately.
- Theme toggle (dark/light); labels restyle per theme.

## Files
- `index.html` — layout, panels, top controls, help modal, gizmo hook.
- `scripts/main.js` — Three.js scene, loading printers, alignment/flatten, toggles, custom-add form, highlighting, STL loader, camera/grid logic, 2D/3D handling, mobile tweaks.
- `styles/style.css` — dark/light styling, responsive layout, overlays/modals, controls.
- `data/printers.json` — grouped printer specs (brand/name/dimensions/color).
- `assets/3DBenchy.stl`, `assets/Voron_Design_Cube_v7(R2).stl` — bundled reference models.

## Usage
1) Serve the folder (e.g., `python -m http.server 8000`) and open in a modern browser.
2) Use the top controls: settings (axes/Benchy/model/align), theme toggle, 2D/3D toggle, and sidebar toggle (mobile overlay).
3) Search or tick printers to show/hide; add custom sizes via the form (replaces same-name entries).
4) Click gizmo labels to snap views; drag to orbit. Hover labels to emphasize a printer and see size/volume. Mouse-wheel in 2D returns to 3D.
