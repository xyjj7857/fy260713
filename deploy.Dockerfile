# ==========================================
# Stage 1: Build stage (using a node image with build tools)
# ==========================================
FROM node:22-slim AS builder

# Install build dependencies for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for optimized caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies like typescript, esbuild, vite)
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Build the client application and bundle the backend server
RUN npm run build

# Remove development dependencies to minimize final image size
RUN npm prune --omit=dev

# ==========================================
# Stage 2: Production runner stage
# ==========================================
FROM node:22-slim AS runner

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Create a dedicated directory for SQLite persistence
RUN mkdir -p /app/data

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built artifacts and package manifest
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# SQLite database will reside in the /app/data directory for persistence
ENV DATABASE_PATH=/app/data/trading.db

# Expose port 3000
EXPOSE 3000

# Start the application using CJS bundled server
CMD ["npm", "start"]
