#!/bin/bash
export PATH="/opt/homebrew/opt/node/bin:/opt/homebrew/bin:$PATH"
export PORT="${PORT:-3000}"
cd "$(dirname "$0")"
npm run dev
