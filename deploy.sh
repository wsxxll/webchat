#!/bin/bash

# Deploy WebChat to Cloudflare Workers

echo "🚀 Deploying WebChat to Cloudflare Workers..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing Wrangler CLI..."
    npm install -g wrangler
fi

# Deploy
echo "Deploying to Cloudflare..."
npx wrangler deploy

echo "✅ Deployment complete!"
echo ""
echo "Don't forget to update assets/config.js with your Worker URL!"