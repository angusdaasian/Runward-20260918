# Fix Chinese map labels

## What will change
- Replace the Leaflet raster basemap used by activity and territory maps with Mapbox's vector renderer, because the raster tile endpoint ignores the language parameter.
- Pass the app's selected language directly to Mapbox (`zh-Hant` for Chinese, `en` for English) and recreate/update the map when the selection changes.
- Keep route lines, start/end markers, fullscreen interaction, territory overlays, and the existing map appearance.
- Apply the same explicit language setting to route-video maps and use a localized rendering path for shared route images where supported.

## Verification
- Open a map with `app_lang=zh` and confirm Mapbox reports `zh-Hant` and Chinese labels are visible.
- Switch to English and confirm labels change to English.
- Check activity and territory maps at desktop and mobile sizes, then confirm the project build remains healthy.
