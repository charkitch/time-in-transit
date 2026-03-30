# Asset Licenses

## Planet Textures

Planet textures live in `public/assets/planets/<category>/`.

No textures are bundled yet. When adding textures, record each one below.
Acceptable licenses: **CC0**, **CC BY 4.0** (attribution required), or equivalent.

### Suggested sources

| Site | License | Notes |
|------|---------|-------|
| [Solar System Scope](https://www.solarsystemscope.com/textures/) | CC BY 4.0 | High-quality real planet maps |
| [NASA Visible Earth](https://visibleearth.nasa.gov/) | Public Domain | Earth imagery |
| [FreePBR.com](https://freepbr.com/) | CC0 | Rock/surface PBR sets |
| [ambientCG](https://ambientcg.com/) | CC0 | PBR materials (good for rocky albedo/normal) |

### File naming convention

```
public/assets/planets/rocky/rocky_01_albedo.jpg   ← 1024×1024 JPG
public/assets/planets/rocky/rocky_01_normal.jpg   ← 1024×1024 JPG (optional)
public/assets/planets/gas/gas_01_albedo.jpg
public/assets/planets/moon/moon_01_albedo.jpg
public/assets/planets/ring/ring_01_albedo.png     ← PNG with alpha channel
```

### Registered textures

_None yet. Add a row per file as you download and resize textures._

| File | Source URL | License | Author | Modifications |
|------|-----------|---------|--------|---------------|
| | | | | |

## Enabling textures

Once textures are in place, uncomment the corresponding entries in
`src/game/rendering/planetSkins.ts` and set
`RENDER_CONFIG.planetTexturesEnabled = true` in `src/game/constants.ts`
(it is already `true` by default — the system falls back gracefully to solid
colors if no skins match).
