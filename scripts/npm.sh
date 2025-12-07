#!/bin/bash
set -e

echo "=== Installing npm packages ==="

echo "-> Installing @anthropic-ai/claude-code..."
npm install -g @anthropic-ai/claude-code

echo "-> Installing ccusage..."
npm install -g ccusage

echo "=== npm setup complete ==="
