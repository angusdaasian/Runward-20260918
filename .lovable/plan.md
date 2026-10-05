# Organize Routes by place and district

## What will change
- Replace the long flat route list with a location-first browser: country/region, then district, then routes.
- For Hong Kong, categorize routes into 香港島 / Hong Kong Island, 九龍 / Kowloon, and 新界 / New Territories using the route’s geographic center; Hong Kong remains separate from China.
- Show district choices with route counts, keep the existing search and distance filters, and only render the selected district’s routes to reduce scrolling.
- Keep each route’s map preview, enlarged map, GPX download, and Send to watch actions unchanged.
- For places without district data, keep a single “All areas” view rather than guessing district names.

## Interface
- Use compact location and district selectors above the route results.
- Add a clear results heading and count so users always know which area they are viewing.
- Preserve the existing RunWard styling and bilingual Traditional Chinese/English labels.

## Verification
- Confirm Hong Kong routes appear under the correct district and never under China.
- Confirm search and distance filters update district counts and results together.
- Confirm map expansion, GPX download, and Send to watch still work from a filtered list.
- Check the Routes screen at mobile and desktop widths and confirm the project remains healthy.
