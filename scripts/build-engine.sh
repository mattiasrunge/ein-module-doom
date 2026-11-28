#!/bin/sh
# Builds Doom, Heretic and Hexen to WebAssembly in a container (engine/Containerfile) and writes
# assets/<game>.js and assets/<game>.wasm for each, the hosted games' server's
# assets/doom-server.js and its wasm, and assets/doom-build.txt. Needs only docker
# with buildx, or podman; run from anywhere.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
if command -v docker >/dev/null 2>&1; then
  docker buildx build --file "$root/engine/Containerfile" --output "type=local,dest=$root/assets" "$root/engine"
else
  podman build --file "$root/engine/Containerfile" --output "type=local,dest=$root/assets" "$root/engine"
fi
ls -l "$root"/assets/*.js "$root"/assets/*.wasm
