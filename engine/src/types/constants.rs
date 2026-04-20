pub const CLUSTER_SEED: u32 = 0xDEADBEEF;
pub const CLUSTER_SIZE: usize = 30;
pub const GALAXY_YEAR_START: u32 = 3200;
pub const ERA_LENGTH: u32 = 250;
pub const STARTING_CREDITS: i32 = 1000;
pub const STARTING_FUEL: f64 = 7.0;
pub const MAX_FUEL: f64 = STARTING_FUEL;
pub const MAX_CARGO: u32 = 20;
pub const HEAT_MAX: f64 = 100.0;
pub const COOLING_RATE: f64 = 10.0;
pub const OVERHEAT_SHIELD_DMG: f64 = 20.0;
pub const SHIELD_REGEN_RATE: f64 = 5.0;
pub const REGEN_HEAT_CEIL: f64 = 50.0;
pub const MAX_SHIELDS: f64 = 100.0;
// Nearlight passage — cruise velocity as fraction of c
pub const CRUISE_VELOCITY: f64 = 0.93;
// Lorentz factor: sqrt(1 - 0.93^2) = sqrt(1 - 0.8649) = sqrt(0.1351)
pub const LORENTZ_FACTOR: f64 = 0.367559518989782;
// Station service prices — mirrored in src/ui/StationUI/StationUI.tsx for display
pub const FUEL_PRICE_PER_UNIT: f64 = 50.0;
pub const SHIELD_REPAIR_COST_PER_POINT: i32 = 5;
