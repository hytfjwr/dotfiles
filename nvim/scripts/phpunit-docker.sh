#!/bin/bash
set -euo pipefail

# Docker経由でPHPUnitを実行するラッパースクリプト
# neotest-phpunitから呼ばれ、パス変換・結果ファイル転送・パス置換を処理する
#
# Usage: phpunit-docker.sh <service> <docker_workdir> [phpunit args...]

SERVICE="$1"
DOCKER_WORKDIR="$2"
shift 2

PROJECT_ROOT="$(pwd)"

ARGS=()
HOST_JUNIT_PATH=""
CONTAINER_JUNIT_PATH="/tmp/neotest-phpunit-result.xml"

for arg in "$@"; do
  if [[ "$arg" == --log-junit=* ]]; then
    HOST_JUNIT_PATH="${arg#--log-junit=}"
    ARGS+=("--log-junit=${CONTAINER_JUNIT_PATH}")
  elif [[ "$arg" == "$PROJECT_ROOT"/* ]]; then
    ARGS+=("${arg#"$PROJECT_ROOT/"}")
  else
    ARGS+=("$arg")
  fi
done

EXIT_CODE=0
docker compose exec -T -w "$DOCKER_WORKDIR" "$SERVICE" vendor/bin/phpunit "${ARGS[@]}" || EXIT_CODE=$?

if [[ -n "$HOST_JUNIT_PATH" ]]; then
  docker compose exec -T "$SERVICE" cat "$CONTAINER_JUNIT_PATH" 2>/dev/null \
    | sed "s|${DOCKER_WORKDIR}/|${PROJECT_ROOT}/|g" \
    > "$HOST_JUNIT_PATH" || true
  docker compose exec -T "$SERVICE" rm -f "$CONTAINER_JUNIT_PATH" 2>/dev/null || true
fi

exit "$EXIT_CODE"
