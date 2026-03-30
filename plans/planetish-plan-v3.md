### Planetish Plan v3 (Save Plan Before Implementation)

**Summary**
Implement textured, “planetish” planets using open-license assets while preserving the wireframe identity and avoiding regressions in NPC/fleet/hyperspace systems.  
Before any code changes, save this plan to `plans/` as the implementation spec.

**Pre-Implementation Step (Required)**
1. Create `plans/planetish-plan-v3.md` containing this plan.
2. Treat that file as the source of truth for implementation scope and acceptance checks.
3. Do not begin code edits until the plan file exists.

**Key Implementation Changes**
1. Add a lightweight skin catalog + selector (seed-stable):
- Introduce `PlanetSkin` definitions (rocky/gas/moon/ring/cloud variants) with map paths and license metadata.
- Add deterministic skin selection using existing system/planet IDs + RNG seed.
- Keep `color` as fallback path (no-skin mode).

2. Upgrade planet mesh creation without disturbing other meshes:
- Extend `makePlanet`/`makeGasGiant` to support textured materials (`MeshStandardMaterial`).
- Preserve a subtle wireframe overlay on textured planets.
- Keep station/NPC/fleet meshes unchanged.

3. Integrate in current `SceneRenderer` flow safely:
- In `loadSystem`, resolve/apply skins for planets, moons, and rings only.
- Make texture load async-safe with immediate material fallback.
- Leave entity updates for `npc_ship`, `fleet_ship`, hyperspace, and battle effects unchanged.

4. Add asset + license pipeline:
- Add `assets/planets/...` structure for `albedo` plus optional `normal/roughness/clouds/ring`.
- Add `ASSET_LICENSES.md` with source and attribution details.
- Initial open sources:
1. https://opengameart.org/content/planet-surface-textures (CC0)  
2. https://www.solarsystemscope.com/textures/ (CC BY 4.0)  
3. https://www.nasa.gov/nasa-brand-center/images-and-media/ (policy reference)

5. Performance profile (balanced desktop/web):
- Default 1K maps, optional 2K for hero planets.
- Cap anisotropy; skip expensive maps on distant/small moons.
- Add URL-keyed texture cache.

**Public Interface/Type Adjustments**
- Extend planet render contract with optional skin hints while keeping `PlanetData` backward compatible.
- Add renderer config toggles:
1. `planetTexturesEnabled`
2. `planetWireOverlayEnabled`
3. `planetTextureQuality` (`low | balanced | high`)

**Test Plan**
1. Determinism: same seed/system gives same skin assignment.
2. Visual: rings/moons/gas giants render correctly with and without optional maps.
3. Regression: NPC patrols, fleet battles, docking, hyperspace unaffected.
4. Performance: frame time + VRAM comparison on dense systems.
5. Licensing: all shipped textures documented with source/license/attribution.

**Assumptions**
- Existing uncommitted gameplay/rendering changes remain in place.
- “Open source” means open-license assets/software (CC0, CC-BY, public domain, MIT-compatible tooling).
- Missing maps fall back to albedo-only or existing color materials.
