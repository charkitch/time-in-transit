import type { DamageSource } from './ShipDamage';

const DEATH_MESSAGES: Record<DamageSource, string[]> = {
  Overheat: ['THERMAL FAILURE', 'Reactor overheat destroyed primary systems.', 'Emergency coolant exhausted.'],
  MicroquasarJet: ['RELATIVISTIC JET', 'Ship vaporized by relativistic plasma outflow.', 'No wreckage recovered.'],
  PulsarBeam: ['RADIATION EXPOSURE', 'Sustained pulsar radiation overwhelmed shields.', 'Hull breach across all decks.'],
  BlackHole: ['EVENT HORIZON', 'Crossed the point of no return.', 'Ship crushed by tidal forces.'],
  TidalDisruption: ['TIDAL DISRUPTION', 'Gravitational shear exceeded structural limits.', 'Hull torn apart.'],
  BattleZone: ['COMBAT CASUALTY', 'Destroyed by crossfire in active battle zone.', 'Escape pods deployed.'],
  XRayStream: ['X-RAY EXPOSURE', 'X-ray transfer stream overwhelmed shielding.', 'Hull compromised.'],
  StarCollision: ['STELLAR IMPACT', 'Ship incinerated on approach to stellar surface.', 'No wreckage found.'],
  PlanetCollision: ['PLANETARY IMPACT', 'Uncontrolled descent into planetary body.', 'Crash site detected on surface.'],
  MoonCollision: ['LUNAR IMPACT', 'Collision with lunar surface at terminal velocity.', 'Debris field detected in low orbit.'],
  AsteroidCollision: ['ASTEROID IMPACT', 'Unshielded hull overheated under repeated belt impacts.', 'Wreckage lost among the debris.'],
  DysonShellCollision: ['SHELL IMPACT', 'Ship destroyed on collision with Dyson shell.', 'Wreckage embedded in superstructure.'],
  TopopolisCollision: ['TOPOPOLIS IMPACT', 'Ship destroyed on collision with topopolis hull.', 'Wreckage scattered across habitat surface.'],
};

export function deathMessageFor(cause: DamageSource): string[] {
  return DEATH_MESSAGES[cause];
}
