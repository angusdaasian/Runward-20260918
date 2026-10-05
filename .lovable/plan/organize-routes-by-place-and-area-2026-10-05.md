# Organize Routes by place and area

## What will change
- Replace the long flat route list with a location-first browser: country/region, then area, then routes.
- For Hong Kong, categorize routes into 香港島 / Hong Kong Island, 九龍 / Kowloon, and 新界 / New Territories using representative points across the route; Hong Kong remains separate from China.
- For Taiwan, categorize routes by the city, county, or township records already available, using Traditional Chinese names in the Chinese interface.
- Show district choices with route counts, keep the existing search and distance filters, and only render the selected district’s routes to reduce scrolling.
- Keep each route’s map preview, enlarged map, GPX download, and Send to watch actions unchanged.
- Use the same area model for future places; where reliable area data is unavailable, keep a single “All areas” view rather than guessing names.

## Interface
- Use compact location and area selectors above the route results.
- Add a clear results heading and count so users always know which area they are viewing.
- Preserve the existing RunWard styling and bilingual Traditional Chinese/English labels.

## Verification
- Confirm Hong Kong routes appear under the correct area and never under China.
- Confirm Taiwan routes are grouped by city/county/township with localized names.
- Confirm search and distance filters update area counts and results together.
- Confirm map expansion, GPX download, and Send to watch still work from a filtered list.
- Check the Routes screen at mobile and desktop widths and confirm the project remains healthy.
