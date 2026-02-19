# Screenshots

This folder is for Chrome Web Store (CWS) listing screenshots and future visual baselines.

All CWS screenshots should be captured at `1280x800` with the extension installed and running on Twitter/X (dark mode recommended to match the in-product experience).

## Required CWS screenshots (5)

1. Intervention popup on a tweet (1280x800)
   - Shows the in-tweet intervention UI rendered on an actual tweet in the X timeline.
   - Should include the popup content plus enough surrounding tweet context to understand placement.

2. Side panel quiz view (1280x800)
   - Shows the political compass quiz flow in the extension side panel.
   - Capture a representative step that shows question + answer controls.

3. Side panel debug view (1280x800)
   - Shows the debug panel with recent tweet analyses and key metrics.
   - Capture a state with at least one analyzed tweet entry visible.

4. 3D visualization dashboard (1280x800)
   - Shows the 3D visualization (user vector + tweet vectors / fallacy overlays).
   - Capture a state with the scene populated (not empty).

5. Extension popup badge (1280x800)
   - Shows the extension popup UI opened from the browser toolbar.
   - Capture with the badge/indicator visible (if applicable).

## Capture notes

- Capture on Twitter/X with the extension installed (unpacked or packaged) to avoid "mock UI" in store media.
- Keep browser zoom at 100% and avoid devtools overlays.
- Use consistent account/theme so future regression comparisons are meaningful.

## Static fixture for InterventionPopup states

For quick visual review of all InterventionPopup states without building/running the extension:

- `extension/test-fixtures/intervention-popup.html`

This fixture renders the popup across these states:

- Low / Medium / High severity (pre-feedback)
- Post-agree
- Post-disagree
- Post-dismiss (popup removed)

Suggested baseline filenames (captured from the static fixture):

- `intervention-popup-01-low-pre.png`
- `intervention-popup-02-medium-pre.png`
- `intervention-popup-03-high-pre.png`
- `intervention-popup-04-post-agree.png`
- `intervention-popup-05-post-disagree.png`
- `intervention-popup-06-post-dismiss.png`
