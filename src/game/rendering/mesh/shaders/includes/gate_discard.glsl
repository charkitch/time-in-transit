// Flyable gate openings and cosmetic windows at separate positions.
uniform float gatesPerWrap;    // flyable gates per wrap (e.g. 2)
uniform float gateRadius;     // gate opening size (aspect-corrected circumference units)
uniform float gateAspect;     // UV aspect ratio (wrapPathLength / tubeCircumference)
uniform float windowsPerWrap; // cosmetic windows per wrap
uniform float windowRadius;   // window porthole radius (raw UV space)

// Set by applyGateDiscard:
float windowBlend = 0.0;   // 1.0 inside a cosmetic window
float gateEdgeBlend = 0.0; // 1.0 at the rim of a gate opening
float dockZoneBlend = 0.0; // 1.0 at dock/industrial zones near gates and entrances

void applyGateDiscard() {
  float dv = abs(vUv.y - 0.5);

  // Flyable gate openings — offset by half-spacing so gates avoid wrap boundaries
  if (gatesPerWrap >= 0.5) {
    float gs = 1.0 / gatesPerWrap;
    float gateOffset = gs * 0.5;
    float nearestGate = floor((vUv.x - gateOffset) / gs + 0.5) * gs + gateOffset;
    float gdu = abs(vUv.x - nearestGate) * gateAspect;
    float gateDist = sqrt(gdu * gdu + dv * dv);
    if (gateDist < gateRadius) discard;
    // Industrial rim just outside the opening
    gateEdgeBlend = smoothstep(gateRadius * 1.6, gateRadius, gateDist);
    // Dock zone — ecumenopolis surrounding each gate (~3x gate radius, soft bleed)
    dockZoneBlend = smoothstep(gateRadius * 7.0, gateRadius * 1.5, gateDist);
  }

  // Entrance dock zones at tube endpoints
  dockZoneBlend = max(dockZoneBlend, smoothstep(0.05, 0.0, vUv.x));
  dockZoneBlend = max(dockZoneBlend, smoothstep(0.95, 1.0, vUv.x));

  // Cosmetic windows — tinted glass, not openings
  if (windowsPerWrap >= 0.5) {
    float ws = 1.0 / windowsPerWrap;
    float nearestWin = floor(vUv.x / ws + 0.5) * ws;
    if (nearestWin > 0.08 && nearestWin < 0.92) {
      float wdu = abs(vUv.x - nearestWin);
      float wDist = sqrt(wdu * wdu + dv * dv);
      if (wDist < windowRadius) {
        windowBlend = smoothstep(windowRadius, windowRadius * 0.6, wDist);
      }
    }
  }
}
