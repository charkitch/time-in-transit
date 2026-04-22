use std::f64::consts::{PI, TAU};

use crate::prng::Prng;
use crate::types::{
    DysonBiomeProfile, GasGiantType, InteractionFieldData, InteractionProfile, InteractionTopology,
    PlanetType, SurfaceType,
};

const PLANET_FIELD_WIDTH: u16 = 128;
const PLANET_FIELD_HEIGHT: u16 = 64;
const SHELL_FIELD_WIDTH: u16 = 96;
const SHELL_FIELD_HEIGHT: u16 = 48;

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

fn to_u8(v: f64) -> u8 {
    (clamp01(v) * 255.0).round() as u8
}

fn rocky_bias(surface_type: SurfaceType) -> f64 {
    match surface_type {
        SurfaceType::Ocean => -0.20,
        SurfaceType::Marsh => -0.12,
        SurfaceType::Continental => -0.02,
        SurfaceType::Mountain => 0.12,
        SurfaceType::Desert => 0.08,
        SurfaceType::Barren => 0.14,
        SurfaceType::Volcanic => 0.16,
        SurfaceType::Ice => 0.03,
        SurfaceType::Venus => 0.06,
        SurfaceType::ForestMoon => -0.04,
    }
}

fn gas_bias(gas_type: GasGiantType) -> f64 {
    match gas_type {
        GasGiantType::Jovian => 0.0,
        GasGiantType::Saturnian => -0.04,
        GasGiantType::Neptunian => -0.02,
        GasGiantType::Inferno => 0.08,
        GasGiantType::Chromatic => 0.02,
        GasGiantType::Helium => -0.06,
    }
}

fn dyson_bias(profile: DysonBiomeProfile) -> f64 {
    match profile {
        DysonBiomeProfile::Continental => 0.02,
        DysonBiomeProfile::Mixed => 0.0,
        DysonBiomeProfile::Desert => 0.06,
        DysonBiomeProfile::Arctic => -0.03,
    }
}

fn build_values(width: u16, height: u16, mut sample: impl FnMut(f64, f64) -> f64) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let mut values = vec![0_u8; w * h];
    for y in 0..h {
        let v = (y as f64 + 0.5) / h as f64;
        for x in 0..w {
            let u = (x as f64 + 0.5) / w as f64;
            values[y * w + x] = to_u8(sample(u, v));
        }
    }
    values
}

fn rocky_field_values(star_id: u32, planet_index: u32, surface_type: SurfaceType) -> Vec<u8> {
    let seed_idx = star_id
        .wrapping_mul(4099)
        .wrapping_add(planet_index.wrapping_mul(911))
        .wrapping_add(17);
    let mut rng = Prng::from_index(0x1ACE_F11D, seed_idx);

    let off_a = rng.float(0.0, TAU);
    let off_b = rng.float(0.0, TAU);
    let off_c = rng.float(0.0, TAU);
    let off_d = rng.float(0.0, TAU);
    let lon_freq_a = rng.float(1.4, 2.6);
    let lat_freq_a = rng.float(1.2, 2.2);
    let warp_freq = rng.float(3.0, 6.0);
    let ridge_freq = rng.float(4.5, 7.5);
    let bias = rocky_bias(surface_type);

    build_values(PLANET_FIELD_WIDTH, PLANET_FIELD_HEIGHT, |u, v| {
        let lon = u * TAU - PI;
        let lat = v * PI - PI * 0.5;

        let continent = (lon * lon_freq_a + off_a).sin() * 0.38
            + (lat * lat_freq_a + off_b).cos() * 0.30
            + (lon * 1.9 + lat * 1.3 + off_c).sin() * 0.18;
        let warp = (lon * warp_freq + lat * 1.1 + off_d).sin() * 0.08
            + (lon * 0.7 - lat * 1.7 + off_c * 0.7).cos() * 0.05;
        let ridge = ((lon * ridge_freq + lat * 2.2 + off_a * 0.5).sin().abs() - 0.5) * 0.12;

        0.5 + continent * 0.55 + warp + ridge + bias
    })
}

fn gas_field_values(star_id: u32, planet_index: u32, gas_type: GasGiantType) -> Vec<u8> {
    let seed_idx = star_id
        .wrapping_mul(6151)
        .wrapping_add(planet_index.wrapping_mul(1237))
        .wrapping_add(29);
    let mut rng = Prng::from_index(0x6A55_F11D, seed_idx);

    let phase_a = rng.float(0.0, TAU);
    let phase_b = rng.float(0.0, TAU);
    let phase_c = rng.float(0.0, TAU);
    let bands = rng.float(2.8, 6.2);
    let turbulence = rng.float(0.9, 2.0);
    let storm_center_u = rng.float(0.0, 1.0);
    let storm_center_v = rng.float(0.2, 0.8);
    let storm_radius = rng.float(0.08, 0.22);
    let bias = gas_bias(gas_type);

    build_values(PLANET_FIELD_WIDTH, PLANET_FIELD_HEIGHT, |u, v| {
        let lat = v * PI - PI * 0.5;
        let lat_norm = lat / (PI * 0.5);
        let lon = u * TAU;
        let band = 0.50
            + (lat_norm * bands * PI + phase_a).sin() * 0.26
            + (lat_norm * bands * turbulence * PI + phase_b).sin() * 0.12
            + (lon * 1.4 + lat_norm * 3.0 + phase_c).sin() * 0.05;

        let du = ((u - storm_center_u + 0.5).rem_euclid(1.0) - 0.5).abs();
        let dv = (v - storm_center_v).abs();
        let dist = (du * du + dv * dv).sqrt();
        let storm = ((storm_radius - dist) / storm_radius).clamp(0.0, 1.0) * 0.22;

        band + storm + bias
    })
}

fn dyson_field_values(
    star_id: u32,
    band_index: u32,
    segment_index: u32,
    profile: DysonBiomeProfile,
) -> Vec<u8> {
    let seed_idx = star_id
        .wrapping_mul(7477)
        .wrapping_add(band_index.wrapping_mul(811))
        .wrapping_add(segment_index.wrapping_mul(379))
        .wrapping_add(53);
    let mut rng = Prng::from_index(0xD150_5EED, seed_idx);

    let off_a = rng.float(0.0, TAU);
    let off_b = rng.float(0.0, TAU);
    let off_c = rng.float(0.0, TAU);
    let lanes = rng.float(2.0, 4.5);
    let weather = rng.float(3.5, 6.5);
    let bias = dyson_bias(profile);

    build_values(SHELL_FIELD_WIDTH, SHELL_FIELD_HEIGHT, |u, v| {
        let longitudinal =
            (u * TAU * lanes + off_a).sin() * 0.24 + (u * TAU * (lanes * 0.5) + off_b).cos() * 0.14;
        let latitudinal = (v * PI * weather + off_c).sin() * 0.22
            + (v * PI * (weather * 0.6) + off_a * 0.7).cos() * 0.10;
        let pocket = ((u * 7.0 + off_b).sin() * (v * 9.0 + off_c).cos()) * 0.08;
        0.5 + longitudinal + latitudinal + pocket + bias
    })
}

pub fn build_planet_interaction_field(
    star_id: u32,
    planet_index: u32,
    planet_type: PlanetType,
    surface_type: SurfaceType,
    gas_type: GasGiantType,
) -> InteractionFieldData {
    let profile = match planet_type {
        PlanetType::Rocky => InteractionProfile::Rocky,
        PlanetType::GasGiant => InteractionProfile::GasGiant,
    };
    let values = match planet_type {
        PlanetType::Rocky => rocky_field_values(star_id, planet_index, surface_type),
        PlanetType::GasGiant => gas_field_values(star_id, planet_index, gas_type),
    };
    InteractionFieldData {
        topology: InteractionTopology::Sphere,
        profile,
        width: PLANET_FIELD_WIDTH,
        height: PLANET_FIELD_HEIGHT,
        values,
    }
}

pub fn build_dyson_shell_interaction_field(
    star_id: u32,
    band_index: u32,
    segment_index: u32,
    profile: DysonBiomeProfile,
) -> InteractionFieldData {
    InteractionFieldData {
        topology: InteractionTopology::ShellPatch,
        profile: InteractionProfile::DysonShell,
        width: SHELL_FIELD_WIDTH,
        height: SHELL_FIELD_HEIGHT,
        values: dyson_field_values(star_id, band_index, segment_index, profile),
    }
}

const TOPOPOLIS_FIELD_HEIGHT: u16 = 64;

/// Build an interaction field for one topopolis wrap.
/// `wrap_aspect` is the ratio of wrap path length to tube circumference,
/// used to scale U frequencies so features appear circular in world space.
pub fn build_topopolis_interaction_field(
    star_id: u32,
    coil_index: u32,
    wrap_aspect: f64,
) -> InteractionFieldData {
    // Scale field width so texels are roughly square in world space (capped at 512).
    let field_width = (TOPOPOLIS_FIELD_HEIGHT as f64 * wrap_aspect)
        .round()
        .clamp(64.0, 512.0) as u16;

    let seed = star_id.wrapping_mul(7919).wrapping_add(coil_index * 2903);
    let mut rng = Prng::from_index(0xC011_0001, seed);

    let phase_u0 = rng.float(0.0, TAU);
    let phase_u1 = rng.float(0.0, TAU);
    let phase_u2 = rng.float(0.0, TAU);
    let phase_v0 = rng.float(0.0, TAU);
    let phase_v1 = rng.float(0.0, TAU);
    let phase_mix = rng.float(0.0, TAU);
    let freq0 = rng.float(1.2, 2.3);
    let freq1 = rng.float(2.4, 4.1);
    let freq2 = rng.float(1.0, 2.2);
    let freq3 = rng.float(2.2, 4.2);
    let seam_break = rng.float(0.6, 1.4);

    // U = along tube length, V = around tube circumference.
    // Field width is already aspect-scaled (line 230), so texels are square in world
    // space. Noise operates in texel-normalized coords where u and v are balanced.
    let values = build_values(field_width, TOPOPOLIS_FIELD_HEIGHT, |u, v| {
        let lon = u * TAU;
        let ring = v * TAU;

        let continental = (lon * freq0 + phase_u0).sin() * 0.22
            + (lon * freq1 + phase_u1).cos() * 0.16
            + ((lon * 1.3 + ring * 1.1 + phase_mix).sin()) * 0.14;
        let circum =
            (ring * freq2 + phase_v0).cos() * 0.20 + (ring * freq3 + phase_v1).sin() * 0.16;
        let warp = ((lon * 2.1 + ring * seam_break + phase_u2).sin()
            * (lon * 0.8 - ring * 1.4 + phase_mix * 0.6).cos())
            * 0.14;
        let ridges = ((lon * 3.2 + ring * 2.5 + phase_u2).sin().abs() - 0.5) * 0.08;

        0.5 + continental + circum + warp + ridges
    });

    InteractionFieldData {
        topology: InteractionTopology::HelixTube,
        profile: InteractionProfile::Topopolis,
        width: field_width,
        height: TOPOPOLIS_FIELD_HEIGHT,
        values,
    }
}
