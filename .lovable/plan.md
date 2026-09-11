# Align Today Stats source priority

## Changes
- Preserve whether each Terra metric is actually available instead of converting missing values to zero.
- Build Today Stats per metric: current Terra steps, calories, and distance first; Apple Health only for missing Terra values.
- Keep the recently corrected sleep-source priority unchanged.
- Verify the app build after the update.

## Technical details
- Make cached Terra daily metrics nullable and version the cache so older zero-filled cache entries cannot mask Apple Health data.
- Merge Terra and Apple values individually rather than selecting one provider object for the entire card.
