# Fix Stridee mobile connection return

## Outcome
The Garmin connection opens in the phone’s secure browser, completes Stridee’s required consent page, then closes and returns to RunWard showing Connected.

## Changes
- Open Stridee through the app’s supported secure-browser flow on phones; keep normal navigation on the website.
- Add a native return marker to the registered Stridee return address.
- On successful return, save the connection before sending the user back through the correct `runward://oauth/...` link.
- Preserve the existing background status refresh as a fallback if the browser is closed manually.
- Verify the website callback and mobile return URL behavior without changing activity sync or data handling.
