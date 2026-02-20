# PianoAI — lightweight production image
# Runs the MCP server (stdio) or CLI with built-in audio engine
#
# Build:  docker build -t pianoai .
# MCP:    docker run --rm -i pianoai
# CLI:    docker run --rm pianoai pianoai list
# Play:   docker run --rm --device /dev/snd pianoai pianoai play song.mid

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ src/

RUN pnpm build

# --- Production stage ---
FROM node:22-slim

# node-web-audio-api needs ALSA for audio output
RUN apt-get update && apt-get install -y --no-install-recommends \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.title="PianoAI"
LABEL org.opencontainers.image.description="Piano player with built-in audio engine — MCP server + CLI"
LABEL org.opencontainers.image.source="https://github.com/mcp-tool-shop-org/pianoai"
LABEL org.opencontainers.image.license="MIT"

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist/ dist/
COPY logo.svg README.md LICENSE ./

# Default: run MCP server (stdio transport)
ENTRYPOINT ["node", "dist/mcp-server.js"]
