# ─── JARVIS Personal Health OS ───────────────────────────────────────────────
# Node.js 22+ required for built-in node:sqlite
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Expose port (configurable via PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/snapshot > /dev/null || exit 1

# Run as non-root
RUN addgroup -S jarvis && adduser -S jarvis -G jarvis && \
    mkdir -p /data && chown jarvis:jarvis /data && \
    chown -R jarvis:jarvis /app
USER jarvis

CMD ["node", "server.js"]
