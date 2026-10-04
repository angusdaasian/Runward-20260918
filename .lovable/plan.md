# Fix Bone's double run (Oct 4 morning)

## What happened
- **Run 1 (30.0 km):** came from his Garmin watch, imported at 04:02 UTC. Started 23:47 UTC on Oct 3.
- **Run 2 (40.4 km):** came from Apple Health, imported at 14:21 UTC. Started 23:45 UTC, about 2 minutes earlier. It has 5h04m of moving time, no heart rate and no elevation, so it is most likely the same run recorded by a phone app with bad distance.
- **Why both stayed:** the duplicate checker only merges two runs that start within 15 minutes of each other and are within 10% of the same distance. These two start 2 minutes apart, but the distances differ by 26%, so it treated them as separate runs.

## Fix
1. **Clean up Bone's account:** hide the 40.4 km Apple Health copy by archiving it (never deleting it), keeping the Garmin run. This is for this one account only.
2. **Tighten the duplicate rule:** two runs that start within 5 minutes of each other and largely overlap in time count as one run, even if their distances differ. The watch version wins over Apple Health.
3. **Check other accounts:** count how many other accounts have the same pattern (report only, no changes). Clean any of them only after you approve, one account at a time.
4. **Changelog:** add a small entry saying duplicate runs from different sources are now merged more reliably.

## Technical details
- `looksDuplicate` in `dedup-activities-cross-platform`: add a rule that treats runs as duplicates when their start times are 5 minutes or less apart, their time ranges overlap by 70% or more (using elapsed/moving time) and both are runs. `chooseWinner` keeps its existing source priority.
- Run dedup for Bone (5b2d3f2e) on its own, then run the read-only count query.
