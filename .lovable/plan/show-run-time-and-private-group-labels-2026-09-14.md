# Show run time and private-group labels

## Changes
- Show each run's local start time beside its date on public and private feed cards.
- Populate the existing private-feed `group_names` value with every group shared by the viewer and runner.
- Display those group names on private-feed cards, including multiple group names when applicable.
- Keep public-feed cards unchanged apart from the added start time.

## Technical details
- Update `get_group_feed` without changing its return signature, preserving current permissions and feed filtering.
- Extend the feed row type and render the private group label through the existing card footer.
- Verify the app build and the database function response.
