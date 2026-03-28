# The Years Between The Stars

A browser-based space exploration and trading game inspired by classics like Elite and the works of Vernor Vinge and Alastair Reynolds. Fly your ship across a procedurally generated galaxy, trade goods between stations, navigate faction politics, and watch civilizations rise and fall as relativistic time passes with each hyperspace jump.

Built with React, TypeScript, Three.js, and Vite.

## Features

- **Free-flight spaceship controls** — thrust, pitch, yaw, roll, with shield, heat, and fuel management
- **Trading economy** — buy and sell goods (food, textiles, luxuries, narcotics, and more) across 30 star systems
- **Hyperspace travel** — jump between systems with relativistic time dilation; years pass with each jump
- **Faction politics** — 6 factions vie for control of systems, with contested territories and fleet battles
- **Procedural generation** — seeded galaxy with multiple star types, orbiting planets, and stations
- **Docking and stations** — dock at stations to trade, refuel, and interact with NPCs

## Getting Started

### Prerequisites

- Node.js 18+ (or newer LTS)
- npm

### Run the Game

```bash
cd space-game
npm install
npm run dev
```

Then open the local URL printed by Vite (typically `http://localhost:5173`).

### Build for Production

```bash
cd space-game
npm run build
npm run preview
```

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file.

Third-party dependencies may use different licenses (including MIT, ISC, BSD-3-Clause, Apache-2.0, and CC-BY-4.0). When redistributing, keep required notices for those dependencies.
