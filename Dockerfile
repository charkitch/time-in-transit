# Stage 1: Build Rust WASM
FROM rust:1-bookworm AS wasm-builder

RUN cargo install wasm-pack --version 0.13.1
RUN rustup target add wasm32-unknown-unknown

WORKDIR /build
COPY engine/ engine/
RUN cd engine && wasm-pack build --target web --out-dir pkg

# Stage 2: Playwright test runner
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS test-runner

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY --from=wasm-builder /build/engine/pkg/ engine/pkg/
COPY . .

RUN npx playwright install chromium

ENV CI=true

CMD ["npx", "playwright", "test", "--config", "tests/playwright.config.ts"]
