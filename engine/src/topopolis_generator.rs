use crate::prng::Prng;
use crate::types::*;
use crate::world_interaction_field::build_topopolis_interaction_field;

const TOPOPOLIS_COLORS: &[u32] = &[0x8A9AA8, 0x7B8C9A, 0x96A4B0, 0xA8B0BA];

pub fn generate_topopolis(star: &StarSystemData) -> Vec<TopopolisCoilData> {
    if star.special_kind != SpecialSystemKind::TheCrown {
        return vec![];
    }

    // Separate RNG stream so topopolis generation does not perturb existing system generation.
    let mut rng = Prng::from_index(0xC011_0001, star.id.wrapping_mul(31337).wrapping_add(7));

    let coil_count = rng.int(4, 6) as u32;
    let orbit_radius = rng.float(3000.0, 4500.0);
    let tube_radius = rng.float(80.0, 150.0);
    // Pitch must guarantee minimum gap between coils.
    // With 3 strands at 0.45 * tube_radius each, and Y wobble,
    // we need pitch > tube_radius * 8 for comfortable spacing.
    let helix_pitch = tube_radius * rng.float(8.0, 12.0);
    let orbit_speed = rng.float(0.000002, 0.000008);
    let orbit_phase = rng.float(0.0, std::f64::consts::TAU);

    // Generate varied biome sequence along the tube length
    let biome_count = rng.int(6, 10) as usize;
    let biome_sequence: Vec<TopopolisBiome> = (0..biome_count)
        .map(|_| *rng.pick(TopopolisBiome::ALL))
        .collect();

    let wrap_path_length =
        ((2.0 * std::f64::consts::PI * orbit_radius).powi(2) + helix_pitch.powi(2)).sqrt();
    let tube_circumference = 2.0 * std::f64::consts::PI * tube_radius;
    let wrap_aspect = wrap_path_length / tube_circumference;

    let interaction_field = build_topopolis_interaction_field(star.id, 0, wrap_aspect);

    vec![TopopolisCoilData {
        id: format!("{}-topopolis-0", star.id),
        name: format!("{} TOPOPOLIS", star.name),
        orbit_radius,
        coil_count,
        tube_radius,
        helix_pitch,
        orbit_speed,
        orbit_phase,
        color: *rng.pick(TOPOPOLIS_COLORS),
        biome_sequence,
        biome_seed: rng.float(0.0, 100.0),
        interaction_field,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cluster_generator::generate_cluster;

    #[test]
    fn crown_system_generates_topopolis() {
        let cluster = generate_cluster();
        let crown = cluster
            .iter()
            .find(|s| s.special_kind == SpecialSystemKind::TheCrown)
            .expect("Missing Crown system");
        let coils = generate_topopolis(crown);
        assert_eq!(coils.len(), 1);
        assert!(coils[0].coil_count >= 4 && coils[0].coil_count <= 6);
        assert!(coils[0].tube_radius >= 80.0 && coils[0].tube_radius <= 150.0);
        assert!(!coils[0].biome_sequence.is_empty());
        assert!(coils[0].biome_sequence.len() >= 6 && coils[0].biome_sequence.len() <= 10);
    }

    #[test]
    fn non_crown_systems_produce_no_topopolis() {
        let cluster = generate_cluster();
        let normal = cluster
            .iter()
            .find(|s| s.special_kind == SpecialSystemKind::None)
            .expect("cluster should contain non-special systems");
        assert!(generate_topopolis(normal).is_empty());
    }

    #[test]
    fn deterministic_topopolis_generation() {
        let cluster = generate_cluster();
        let crown = cluster
            .iter()
            .find(|s| s.special_kind == SpecialSystemKind::TheCrown)
            .expect("cluster should contain Crown system");
        let a = generate_topopolis(crown);
        let b = generate_topopolis(crown);
        assert_eq!(a[0].coil_count, b[0].coil_count);
        assert_eq!(a[0].tube_radius, b[0].tube_radius);
        assert_eq!(a[0].orbit_radius, b[0].orbit_radius);
        assert_eq!(a[0].biome_sequence.len(), b[0].biome_sequence.len());
    }
}
