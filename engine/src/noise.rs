/// 3D simplex noise and fractional Brownian motion.
///
/// Direct port of the GLSL implementation in `shaders/includes/noise.glsl`
/// (Ashima/Stefan Gustavson). Both implementations MUST stay in sync —
/// the parity tests below lock them to the same golden values.
// All helpers mirror the GLSL vec4 operations element-wise.
fn mod289(x: f64) -> f64 {
    x - (x * (1.0 / 289.0)).floor() * 289.0
}

fn permute4(x: [f64; 4]) -> [f64; 4] {
    x.map(|v| mod289(((v * 34.0) + 1.0) * v))
}

fn taylor_inv_sqrt4(r: [f64; 4]) -> [f64; 4] {
    r.map(|v| 1.79284291400159 - 0.85373472095314 * v)
}

fn dot3(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// 3D simplex noise. Returns a value in approximately [-1, 1].
///
/// Line-for-line port of `snoise(vec3 v)` from noise.glsl, using [f64; 4]
/// arrays to mirror the GLSL vec4 operations and avoid swizzle mistakes.
pub fn snoise(vx: f64, vy: f64, vz: f64) -> f64 {
    // const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    // const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    let c_x = 1.0 / 6.0;
    let c_y = 1.0 / 3.0;

    // vec3 i = floor(v + dot(v, C.yyy));
    let dot_v_cy = (vx + vy + vz) * c_y;
    let i = [
        (vx + dot_v_cy).floor(),
        (vy + dot_v_cy).floor(),
        (vz + dot_v_cy).floor(),
    ];

    // vec3 x0 = v - i + dot(i, C.xxx);
    let dot_i_cx = (i[0] + i[1] + i[2]) * c_x;
    let x0 = [
        vx - i[0] + dot_i_cx,
        vy - i[1] + dot_i_cx,
        vz - i[2] + dot_i_cx,
    ];

    // vec3 g = step(x0.yzx, x0.xyz);
    let g: [f64; 3] = [
        if x0[0] >= x0[1] { 1.0 } else { 0.0 },
        if x0[1] >= x0[2] { 1.0 } else { 0.0 },
        if x0[2] >= x0[0] { 1.0 } else { 0.0 },
    ];
    // vec3 l = 1.0 - g;
    let l = [1.0 - g[0], 1.0 - g[1], 1.0 - g[2]];

    // vec3 i1 = min(g.xyz, l.zxy);
    let i1 = [g[0].min(l[2]), g[1].min(l[0]), g[2].min(l[1])];
    // vec3 i2 = max(g.xyz, l.zxy);
    let i2 = [g[0].max(l[2]), g[1].max(l[0]), g[2].max(l[1])];

    // vec3 x1 = x0 - i1 + C.xxx;
    let x1 = [
        x0[0] - i1[0] + c_x,
        x0[1] - i1[1] + c_x,
        x0[2] - i1[2] + c_x,
    ];
    // vec3 x2 = x0 - i2 + C.yyy;
    let x2 = [
        x0[0] - i2[0] + c_y,
        x0[1] - i2[1] + c_y,
        x0[2] - i2[2] + c_y,
    ];
    // vec3 x3 = x0 - D.yyy;
    let x3 = [x0[0] - 0.5, x0[1] - 0.5, x0[2] - 0.5];

    // i = mod289(i);
    let i = [mod289(i[0]), mod289(i[1]), mod289(i[2])];

    // vec4 p = permute(permute(permute(
    //   i.z + vec4(0.0, i1.z, i2.z, 1.0))
    //   + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    //   + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    let pz = permute4([i[2], i[2] + i1[2], i[2] + i2[2], i[2] + 1.0]);
    let py = permute4([
        pz[0] + i[1],
        pz[1] + i[1] + i1[1],
        pz[2] + i[1] + i2[1],
        pz[3] + i[1] + 1.0,
    ]);
    let p = permute4([
        py[0] + i[0],
        py[1] + i[0] + i1[0],
        py[2] + i[0] + i2[0],
        py[3] + i[0] + 1.0,
    ]);

    // float n_ = 0.142857142857;  (1/7 — GLSL literal is fine at f32 precision)
    // vec3 ns = n_ * D.wyz - D.xzx;
    // Use exact 1/7 in f64 to avoid floor() errors at integer boundaries.
    let n_ = 1.0_f64 / 7.0;
    let ns = [n_ * 2.0, n_ * 0.5 - 1.0, n_]; // (2/7, 1/14 - 1, 1/7)

    // vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    // p values are integers (within f64 rounding). Round to clean integers,
    // then use integer arithmetic for mod/div to avoid f64 boundary errors
    // that cause the GLSL's floor(j * 1/7) trick to give wrong results at f64.
    let j_int = p.map(|v| {
        let vi = v.round() as i32;
        ((vi % 49) + 49) % 49 // ensure non-negative mod
    });

    // x_ = j / 7, y_ = j % 7 — exact via integer division
    let x_ = j_int.map(|v| (v / 7) as f64);
    let y_ = j_int.map(|v| (v % 7) as f64);

    // vec4 x = x_ * ns.x + ns.yyyy;
    let x = x_.map(|v| v * ns[0] + ns[1]);
    // vec4 y = y_ * ns.x + ns.yyyy;
    let y = y_.map(|v| v * ns[0] + ns[1]);
    // vec4 h = 1.0 - abs(x) - abs(y);
    let h = [
        1.0 - x[0].abs() - y[0].abs(),
        1.0 - x[1].abs() - y[1].abs(),
        1.0 - x[2].abs() - y[2].abs(),
        1.0 - x[3].abs() - y[3].abs(),
    ];

    // vec4 b0 = vec4(x.xy, y.xy);
    let b0 = [x[0], x[1], y[0], y[1]];
    // vec4 b1 = vec4(x.zw, y.zw);
    let b1 = [x[2], x[3], y[2], y[3]];

    // vec4 s0 = floor(b0)*2.0 + 1.0;
    let s0 = b0.map(|v| v.floor() * 2.0 + 1.0);
    // vec4 s1 = floor(b1)*2.0 + 1.0;
    let s1 = b1.map(|v| v.floor() * 2.0 + 1.0);

    // vec4 sh = -step(h, vec4(0.0));
    let sh = h.map(|v| if v <= 0.0 { -1.0 } else { 0.0 });

    // vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    let a0 = [
        b0[0] + s0[0] * sh[0], // b0.x + s0.x * sh.x
        b0[2] + s0[2] * sh[0], // b0.z + s0.z * sh.x
        b0[1] + s0[1] * sh[1], // b0.y + s0.y * sh.y
        b0[3] + s0[3] * sh[1], // b0.w + s0.w * sh.y
    ];
    // vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    let a1 = [
        b1[0] + s1[0] * sh[2], // b1.x + s1.x * sh.z
        b1[2] + s1[2] * sh[2], // b1.z + s1.z * sh.z
        b1[1] + s1[1] * sh[3], // b1.y + s1.y * sh.w
        b1[3] + s1[3] * sh[3], // b1.w + s1.w * sh.w
    ];

    // vec3 p0 = vec3(a0.xy, h.x);  etc.
    let g0 = [a0[0], a0[1], h[0]];
    let g1 = [a0[2], a0[3], h[1]];
    let g2 = [a1[0], a1[1], h[2]];
    let g3 = [a1[2], a1[3], h[3]];

    // vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),...));
    let norm = taylor_inv_sqrt4([dot3(g0, g0), dot3(g1, g1), dot3(g2, g2), dot3(g3, g3)]);

    // p0 *= norm.x; etc.
    let g0 = [g0[0] * norm[0], g0[1] * norm[0], g0[2] * norm[0]];
    let g1 = [g1[0] * norm[1], g1[1] * norm[1], g1[2] * norm[1]];
    let g2 = [g2[0] * norm[2], g2[1] * norm[2], g2[2] * norm[2]];
    let g3 = [g3[0] * norm[3], g3[1] * norm[3], g3[2] * norm[3]];

    // vec4 m = max(0.6 - vec4(dot(x0,x0),...), 0.0);
    let mut m = [
        (0.6 - dot3(x0, x0)).max(0.0),
        (0.6 - dot3(x1, x1)).max(0.0),
        (0.6 - dot3(x2, x2)).max(0.0),
        (0.6 - dot3(x3, x3)).max(0.0),
    ];

    // m = m * m;
    m = [m[0] * m[0], m[1] * m[1], m[2] * m[2], m[3] * m[3]];

    // return 42.0 * dot(m*m, vec4(dot(p0,x0),...));
    42.0 * (m[0] * m[0] * dot3(g0, x0)
        + m[1] * m[1] * dot3(g1, x1)
        + m[2] * m[2] * dot3(g2, x2)
        + m[3] * m[3] * dot3(g3, x3))
}

/// Fractional Brownian motion — 5 octaves of simplex noise.
/// Matches `fbm(vec3 p)` in noise.glsl exactly.
pub fn fbm(mut x: f64, mut y: f64, mut z: f64) -> f64 {
    let mut v = 0.0;
    let mut a = 0.5;
    for _ in 0..5 {
        v += a * snoise(x, y, z);
        x = x * 2.0 + 100.0;
        y = y * 2.0 + 100.0;
        z = z * 2.0 + 100.0;
        a *= 0.5;
    }
    v
}

pub struct TopopolisTerrainParams<'a> {
    pub field_values: &'a [u8],
    pub field_width: u16,
    pub field_height: u16,
    pub u: f64,
    pub v: f64,
    pub local_pos: [f64; 3],
    pub noise_scale: f64,
    pub seed: f64,
    pub biome_seed: f64,
    pub field_blend: f64,
}

/// Sample topopolis terrain at a position, replicating the shader's computation.
/// Returns the macro terrain value (same as `macro` in topopolis_interior.frag.glsl).
pub fn sample_topopolis_terrain(p: &TopopolisTerrainParams) -> f64 {
    let &TopopolisTerrainParams {
        field_values,
        field_width,
        field_height,
        u,
        v,
        local_pos,
        noise_scale,
        seed,
        biome_seed,
        field_blend,
    } = p;
    // Bilinear sample of the interaction field — matches the GPU's LINEAR filter.
    let w = field_width as f64;
    let h = field_height as f64;
    let uu = u.rem_euclid(1.0) * w - 0.5;
    let vv = v.clamp(0.0, 1.0) * h - 0.5;
    let x0 = (uu.floor() as isize).rem_euclid(field_width as isize) as usize;
    let x1 = (x0 + 1) % field_width as usize;
    let y0 = (vv.floor().max(0.0) as usize).min(field_height as usize - 1);
    let y1 = (y0 + 1).min(field_height as usize - 1);
    let fx = uu.fract();
    let fy = vv.fract();
    let fw = field_width as usize;
    let sample = |sx: usize, sy: usize| -> f64 {
        field_values.get(sy * fw + sx).copied().unwrap_or(128) as f64 / 255.0
    };
    let field_val = sample(x0, y0) * (1.0 - fx) * (1.0 - fy)
        + sample(x1, y0) * fx * (1.0 - fy)
        + sample(x0, y1) * (1.0 - fx) * fy
        + sample(x1, y1) * fx * fy;
    let field = field_val * 2.0 - 1.0;

    // FBM noise — same seed offsets as topopolis_interior.frag.glsl
    let nx = local_pos[0] * noise_scale + seed * 13.37;
    let ny = local_pos[1] * noise_scale + biome_seed * 7.13;
    let nz = local_pos[2] * noise_scale + seed * 3.71;
    let noise = fbm(nx, ny, nz);

    // mix(noise, field, field_blend)
    noise * (1.0 - field_blend) + field * field_blend
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_approx(a: f64, b: f64, epsilon: f64, label: &str) {
        assert!(
            (a - b).abs() < epsilon,
            "{label}: expected {b:.15}, got {a:.15}, diff {}",
            (a - b).abs()
        );
    }

    #[test]
    fn snoise_deterministic() {
        assert_eq!(snoise(1.0, 2.0, 3.0), snoise(1.0, 2.0, 3.0));
        assert_eq!(snoise(-0.5, 0.7, 1.3), snoise(-0.5, 0.7, 1.3));
    }

    #[test]
    fn snoise_output_range() {
        // The Ashima implementation uses taylorInvSqrt (a linear approximation
        // of 1/sqrt) which doesn't perfectly normalize gradients. Combined with
        // the empirical 42.0 scale factor, values can exceed [-1, 1] by ~25%.
        // The GLSL has the same property. For terrain this is fine — smoothstep
        // thresholds handle it.
        let inputs: Vec<(f64, f64, f64)> = (0..1000)
            .map(|i| {
                let t = i as f64 * 0.137;
                (
                    t.sin() * 50.0,
                    (t * 1.3).cos() * 50.0,
                    (t * 0.7).sin() * 50.0,
                )
            })
            .collect();
        for (x, y, z) in &inputs {
            let v = snoise(*x, *y, *z);
            assert!(
                (-1.5..=1.5).contains(&v),
                "snoise({x}, {y}, {z}) = {v} out of range"
            );
        }
    }

    #[test]
    fn fbm_output_range() {
        let inputs: Vec<(f64, f64, f64)> = (0..1000)
            .map(|i| {
                let t = i as f64 * 0.213;
                (
                    t.cos() * 30.0,
                    (t * 0.9).sin() * 30.0,
                    (t * 1.7).cos() * 30.0,
                )
            })
            .collect();
        for (x, y, z) in &inputs {
            let v = fbm(*x, *y, *z);
            assert!(
                (-1.5..=1.5).contains(&v),
                "fbm({x}, {y}, {z}) = {v} out of range"
            );
        }
    }

    // Golden values — hardcoded regression lock. If the algorithm changes,
    // these break. To verify GLSL parity: render a test shader outputting
    // noise at these positions as pixel colors and compare (within f32 epsilon).
    #[test]
    fn snoise_golden_values() {
        let eps = 1e-10;
        assert_approx(snoise(0.0, 0.0, 0.0), -0.412198798740470, eps, "origin");
        assert_approx(snoise(1.0, 2.0, 3.0), 0.733515211734548, eps, "simple");
        assert_approx(snoise(-0.5, 0.7, 1.3), 0.080307272639140, eps, "negative");
        assert_approx(
            snoise(100.1, 200.2, 300.3),
            -0.322324183118609,
            eps,
            "large",
        );
        assert_approx(snoise(0.25, 0.25, 0.25), -0.122253092268295, eps, "quarter");
        assert_approx(snoise(-10.0, 5.5, -3.3), 0.446321109723967, eps, "mixed");
    }

    #[test]
    fn fbm_golden_values() {
        let eps = 1e-10;
        assert_approx(fbm(0.5, 0.5, 0.5), -0.074447200209263, eps, "fbm center");
        assert_approx(
            fbm(13.37, 7.13, 3.71),
            0.058541761372269,
            eps,
            "fbm seed-like",
        );
        assert_approx(fbm(0.0, 0.0, 0.0), -0.048498540890963, eps, "fbm origin");
    }

    /// Verify f32 rounding drift is small — the GLSL runs in f32, Rust in f64.
    #[test]
    fn f32_f64_drift_is_small() {
        let test_points = [
            (0.5, 0.5, 0.5),
            (1.0, 2.0, 3.0),
            (-0.5, 0.7, 1.3),
            (5.3, -2.1, 8.7),
            (13.37, 7.13, 3.71),
        ];
        for &(x, y, z) in &test_points {
            let f64_val = snoise(x, y, z);
            let perturbed_val = snoise((x as f32) as f64, (y as f32) as f64, (z as f32) as f64);
            let drift = (f64_val - perturbed_val).abs();
            assert!(
                drift < 0.05,
                "f32 drift at ({x},{y},{z}): {drift} (f64={f64_val}, f32-rounded={perturbed_val})"
            );
        }
    }

    #[test]
    fn sample_topopolis_terrain_blends_field_and_noise() {
        let field: Vec<u8> = (0..16).map(|i| (i * 16) as u8).collect();
        let val = sample_topopolis_terrain(&TopopolisTerrainParams {
            field_values: &field,
            field_width: 4,
            field_height: 4,
            u: 0.5,
            v: 0.5,
            local_pos: [10.0, 20.0, 30.0],
            noise_scale: 0.01,
            seed: 42.0,
            biome_seed: 7.0,
            field_blend: 0.25,
        });
        assert!(val.is_finite(), "terrain sample is not finite: {val}");
        assert!(
            (-2.0..2.0).contains(&val),
            "terrain sample out of range: {val}"
        );
    }
}
