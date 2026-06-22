# Plan: Codespaces dev + multi-device editing & preview

Goal: run this repo in a GitHub Codespace, edit it from both a laptop and an
Android phone, and view the running game (Vite dev server) on both devices.

The key idea: **one Codespace = one container.** The laptop and phone both
*attach* to that same container, so edits and the running dev server are shared
automatically — there is nothing to sync. We just need (a) a devcontainer that
can build the Rust/WASM + Vite stack, and (b) the dev port forwarded so any
logged-in browser can reach it.

---

## Stack facts this plan is built on

- Frontend: Vite 8 + React 18 + Three.js, dev server on port **5173**.
- Engine: Rust → WASM via `wasm-pack build --target web` (`npm run wasm:build`),
  needs `wasm32-unknown-unknown` target + `wasm-pack` 0.13.1 (per `Dockerfile`).
- App is a PWA (`vite-plugin-pwa`) — installable on the phone once reachable.
- No `.devcontainer/` exists yet — this plan adds one.

---

## Step 1 — Add a devcontainer

Create `.devcontainer/devcontainer.json`:

```jsonc
{
  "name": "the-years-between-the-stars",
  "image": "mcr.microsoft.com/devcontainers/rust:1-bookworm",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" }
  },
  // Build the toolchain + WASM once on create. wasm-pack via the install
  // script is much faster than `cargo install`.
  "postCreateCommand": "rustup target add wasm32-unknown-unknown && curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh && npm ci && npm run wasm:build",
  "forwardPorts": [5173],
  "portsAttributes": {
    "5173": { "label": "Vite dev (game)", "onAutoForward": "openPreview" }
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "rust-lang.rust-analyzer",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  }
}
```

Notes:
- The Rust base image already has `cargo`/`rustup`; the Node feature adds Node 20
  + npm. Pin a `version` if the build ever cares.
- `postCreateCommand` runs once per Codespace creation. After that, rebuild WASM
  only when Rust changes: `npm run wasm:build`.
- Optional speed-up later: enable **Prebuilds** (repo Settings → Codespaces →
  Set up prebuild) so a new Codespace starts with deps + WASM already built.

## Step 2 — Make Vite reachable from the forwarding proxy

Vite binds to `localhost` by default. Codespaces' port proxy runs *inside* the
container so that usually works, but binding to all interfaces is more reliable
and fixes HMR over the forwarded HTTPS domain. Simplest: run with `--host`.

Either run `npm run dev -- --host`, or make it the default by editing the `dev`
script in `package.json`:

```jsonc
"dev": "vite --host",
```

If HMR (live reload) misbehaves on the phone/forwarded URL, add a server block
to `vite.config.ts` (the forwarded domain terminates TLS on 443):

```ts
server: {
  host: true,
  hmr: { clientPort: 443 },
},
```

## Step 3 — Create the Codespace

1. Push this branch (with `.devcontainer/`) to GitHub.
2. On the repo page: **Code ▸ Codespaces ▸ Create codespace on
   `procedural-music-setup`** (or your chosen branch).
3. Wait for `postCreateCommand` to finish (first build of WASM + npm install).
4. In the Codespace terminal: `npm run dev`. Port 5173 auto-forwards and a
   preview opens.

---

## Editing from both devices

Both clients attach to the **same** Codespace — no manual sync.

**Laptop** — best experience, pick one:
- VS Code Desktop → install *GitHub Codespaces* extension → "Connect to
  Codespace", or
- Browser: open the Codespace from the repo's Codespaces list (full VS Code web
  with a terminal).

**Android phone:**
- Open the Codespace in **Chrome** from the repo (Code ▸ Codespaces ▸ tap the
  running Codespace). This is the full browser VS Code editor **with a
  terminal**, so you can edit *and* run `npm run dev` from the phone.
- The GitHub Mobile app and `github.dev` (press `.` on the repo) are fine for
  quick text edits but **cannot run** the container/dev server — use the
  Codespace-in-Chrome path when you need the game running.
- Tip: a Bluetooth keyboard makes phone editing far more usable.

Because it's one container, a file you save on the laptop is instantly the file
the phone sees, and one running dev server serves both.

---

## Viewing the running game on both devices

1. Start it once in the Codespace: `npm run dev` (only needs to run on one
   client; the container hosts it for everyone).
2. Codespaces forwards 5173 to a URL like
   `https://<codespace-name>-5173.app.github.dev`.
3. **Port visibility** (Ports tab, right-click the port):
   - **Private** (default): only *you*, when signed into GitHub, can open the
     URL — works on both your laptop and phone since both are logged in. Keep
     this unless you want to share.
   - **Public**: anyone with the link can load it (handy for quick external
     demos, e.g. on a tablet not signed in).
4. Open that forwarded URL in the browser on each device. On the phone, use
   Chrome's **Add to Home screen** to install it as the PWA for a fullscreen,
   app-like view.

---

## Operational notes

- **Lifecycle/cost:** Codespaces stop after ~30 min idle and bill compute +
  storage against your monthly free hours. Stop it manually when done; the
  filesystem (and uncommitted work) persists across stops until you delete it.
- **Persisting work:** commit/push regularly — deleting a Codespace deletes
  anything uncommitted.
- **Rebuilds:** changing `.devcontainer/devcontainer.json` requires a container
  rebuild (Command Palette → "Codespaces: Rebuild Container").
- **Rust iteration:** after editing `engine/`, re-run `npm run wasm:build`
  before the change shows up in the game.

---

## Checklist

- [ ] Add `.devcontainer/devcontainer.json`
- [ ] Set `dev` script to `vite --host` (and optional HMR `clientPort` if needed)
- [ ] Push branch; create Codespace; confirm WASM + deps built
- [ ] `npm run dev`, confirm port 5173 forwards and game loads in the editor
- [ ] Attach from laptop (VS Code Desktop or browser) — edit + see game
- [ ] Attach from Android Chrome — edit + see game; install as PWA
- [ ] (Optional) Enable Prebuilds for faster cold starts
