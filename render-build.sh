#!/usr/bin/env bash
# Build script for Render deployment

set -o errexit

echo "🚀 Starting Render build for API..."

# Install dependencies for the entire monorepo
echo "📦 Installing dependencies..."
pnpm install

# Build the API
echo "🔨 Building API..."
cd apps/api
pnpm build

echo "✅ Build completed successfully!" 