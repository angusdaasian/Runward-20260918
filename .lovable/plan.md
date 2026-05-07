## Tap-to-expand fullscreen map

Make the activity detail map tappable to open a fullscreen interactive view.

### Changes (single file: `src/components/activities/ActivityMap.tsx`)

1. Keep the existing 128px preview map exactly as-is (non-interactive thumbnail with route, start/end dots, Carto Voyager tiles).
2. Wrap the preview in a `<button>` with `aria-label="Expand map"` and a subtle hover hint (e.g. small expand icon overlay in the top-right corner using `lucide-react`'s `Maximize2`).
3. On tap, open a shadcn `Dialog` containing a second Leaflet map instance that is fully interactive:
   - `dragging: true`, `scrollWheelZoom: true`, `doubleClickZoom: true`, `touchZoom: true`
   - `zoomControl: true`, `attributionControl: true`
   - Same Carto Voyager tiles, same white-cased orange polyline, same start/end markers
   - Fits bounds with a bit more padding
   - Container sized to fill the dialog (e.g. `h-[80vh] w-full`)
4. The fullscreen map is mounted only when the dialog opens (so we don't pay the cost upfront), and its Leaflet instance is cleaned up on close to avoid leaks. Use a separate `ref` so it doesn't conflict with the preview map.
5. Dialog uses `max-w-[95vw]` on mobile and a close button (shadcn `Dialog` provides one by default).

### Notes
- No changes to `ActivityDetail.tsx` — the `<ActivityMap polyline=... />` API stays the same.
- Leaflet CSS is already imported.
- Polyline decoding logic is reused (extract `decodePolyline` to module scope, already is).
