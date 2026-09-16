# Adjustable photo stats overlay

## Goal
Let users place and size the stats directly on their activity photo before sharing, while keeping the experience simple on a phone.

## Experience
- When **Put stats on my photo** is enabled, show a portrait preview using the selected activity photo.
- The stats appear as one movable block. Users drag the block anywhere within safe photo bounds.
- A single **Size** slider changes the whole block proportionally; no small resize handles that are difficult to use on mobile.
- Add three quick positions: **Top**, **Middle**, and **Bottom**, plus **Reset**. Dragging remains available for precise placement.
- Keep the Runward logo fixed at the top-right so branding stays consistent and cannot overlap or disappear.
- Keep existing stat checkboxes; the preview updates immediately when stats are included or removed.

## Implementation
- Store overlay placement as normalized x/y coordinates and scale, so preview and exported 1080×1350 image match across screen sizes.
- Add a reusable photo preview/editor inside the custom share dialog with pointer-event dragging and clamped safe bounds.
- Pass the chosen placement and scale into the existing share-card renderer.
- Update the canvas renderer to position and scale the complete stats group, including its readability shading, while preserving the current photo crop and selected data.
- Preserve the existing non-photo custom-card flow unchanged.

## Validation
- Check drag, presets, reset, size changes, photo switching, and selected-stat changes on a phone-sized viewport.
- Confirm the exported card matches the preview and the overlay never leaves the image.
- Run the existing TypeScript checks and confirm the preview build is clean.
