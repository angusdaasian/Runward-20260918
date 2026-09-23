# Keep the homepage activity map loaded

## Change
- Keep the Activity tab mounted at its normal size when another bottom tab is selected.
- Layer inactive tab content instead of using `display: none`, so Mapbox retains its canvas, tiles, route, and camera state.
- Disable interaction and accessibility focus on the hidden layer.

## Verification
- Switch from Activities to another bottom tab and back repeatedly.
- Confirm the existing map returns immediately without a loading flash or tile refresh.
- Confirm scrolling and controls work only on the visible tab.
