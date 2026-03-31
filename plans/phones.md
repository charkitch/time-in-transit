# Phone Browser Readiness Plan

## Summary
Make the game fully playable on phone browsers by treating mobile as a separate control and performance target, not as a CSS-only responsive pass. The current build already runs in-browser, but phone reliability is blocked by keyboard-only flight input, desktop-density HUD/layout, and rendering defaults that are too aggressive for mobile GPUs.

Defaults chosen for this plan:
- Mobile goal: full touch play
- Orientation: landscape for gameplay
- Portrait: allowed for menus/dialogs, but flight shows a rotate-device prompt
- Target browsers: iOS Safari and Android Chrome on recent devices

## Key Changes

### 1. Mobile capability layer and boot flow
- Add a mobile/browser capability check at app boot to classify device, coarse pointer, viewport size, reduced-motion preference, and WebGL support level.
- Add a lightweight boot state before `new Game(...)` so the app can show:
  - loading/progress
  - unsupported-device messaging
  - rotate-to-landscape prompt during flight
  - low-performance fallback messaging if WebGL init or frame pacing degrades
- Add explicit handling for WebGL context loss/restoration in the renderer so mobile tab switching and GPU eviction do not leave the game dead.

Public/interface impact:
- Introduce a small `RuntimeProfile` or similar type shared by app/render/input layers:
  - `isMobile`
  - `isTouchPrimary`
  - `isLandscape`
  - `pixelRatioCap`
  - `qualityTier`

### 2. Replace keyboard-only flight with touch controls
- Refactor [`src/game/input/InputSystem.ts`](/Users/charleskitchen/projects/the-years-between-the-stars/src/game/input/InputSystem.ts) so input sources are composable instead of hard-coded to keyboard events.
- Keep keyboard support intact, but add a touch input provider for mobile:
  - left thumb virtual stick for pitch/yaw
  - right-side hold button for thrust
  - secondary hold/toggle for boost
  - tap buttons for dock, hail, target cycle, cluster map, system map, jump
- Avoid gesture ambiguity with page scrolling/zooming:
  - disable browser panning on the gameplay surface with `touch-action`
  - prevent accidental text selection/callouts
  - use pointer events rather than mouse-specific handlers for shared desktop/mobile behavior
- Add dead zones, larger hit targets, and visual pressed states.
- Add pause/recovery behavior when touch focus is interrupted by browser UI or app switching.

Public/interface impact:
- Extend `InputState` to remain source-agnostic but support analog touch values cleanly.
- Add an input abstraction such as `InputProvider` or equivalent so `Game` reads one merged state rather than talking directly to keyboard state.

### 3. Mobile HUD and overlay redesign
- Rework [`src/ui/HUD/HUD.tsx`](/Users/charleskitchen/projects/the-years-between-the-stars/src/ui/HUD/HUD.tsx) and related CSS for a mobile HUD mode instead of shrinking the desktop HUD.
- In mobile flight mode:
  - remove the verbose keyboard help block
  - compress top-left/top-right panels to shorter labels and fewer simultaneous stats
  - move action buttons into a dedicated touch control rail
  - keep scanner/status readable with safe-area padding and larger text
- Add safe-area handling for notches/home indicators using `env(safe-area-inset-*)`.
- Treat overlays as mobile-first:
  - cluster map and system map scale to viewport instead of fixed `520x420` / `540x400`
  - canvas interactions use pointer/tap, not `onMouseMove`
  - station/trade dialogs become stacked, scroll-friendly layouts with large buttons
- Add a landscape-only gameplay shell and portrait fallback panel.

Public/interface impact:
- Add a `mobile` or `runtimeProfile` prop/context for HUD and overlay components.
- Preserve existing game-state APIs; this is mostly presentation and interaction restructuring.

### 4. Mobile rendering and performance budget
- Add runtime quality tiers in [`src/game/rendering/SceneRenderer.ts`](/Users/charleskitchen/projects/the-years-between-the-stars/src/game/rendering/SceneRenderer.ts):
  - cap pixel ratio on mobile, do not use full `window.devicePixelRatio`
  - reduce antialias cost on low tiers
  - lower geometry complexity for stars/meshes/effects
  - reduce particle counts, glow intensity, and expensive transparency where possible
- Make quality adaptive rather than fixed:
  - start mobile at a conservative tier
  - optionally step down if frame time stays poor
- Reduce continuous full-screen overlay cost for flashes/glows on low-end devices.
- Ensure resize/orientation handling uses the actual visual viewport where needed so browser chrome changes do not distort canvas size.

Acceptance target:
- Stable play on phone without thermal/perf collapse during several minutes of flight, map use, and docking transitions.

### 5. Mobile-specific resilience and packaging
- Add a basic PWA-style shell only if desired later; it is not required for browser playability.
- More important in v1:
  - test WASM load/init on mobile Safari and Chrome
  - ensure initial bundle/WASM startup messaging is clear
  - avoid any boot dependency on desktop-only APIs
- Investigate the current build friction around `wasm-pack`/`wasm-bindgen` so production builds are reproducible in CI and local release workflows; mobile support depends on dependable asset generation even though this is not mobile-specific.

## Test Plan
- Boot/load on iPhone Safari and Android Chrome.
- Enter flight in landscape and verify all core actions are available without hardware keyboard.
- Rotate to portrait during flight and verify rotate prompt appears without corrupting state.
- Use cluster map, system map, landing dialog, comms, and station UI entirely by touch.
- Confirm no page scroll/zoom interference on gameplay surface.
- Verify safe-area spacing on notch devices.
- Simulate tab backgrounding/foregrounding and confirm rendering/input recover.
- Exercise long session flow: flight, target cycling, hail, dock, trade, undock, jump.
- Verify low-tier rendering still keeps gameplay legible.
- Regression test desktop keyboard/mouse behavior remains unchanged.

## Assumptions
- “Reliable on phone” means fully playable in-browser, not app-store wrapping.
- Mobile gameplay is optimized for landscape; portrait is not required for active flight.
- Recent iOS Safari and Android Chrome are the support floor; older/mobile WebView edge cases are not a v1 target.
- Desktop visuals may remain richer than mobile; parity is functional, not identical fidelity.
