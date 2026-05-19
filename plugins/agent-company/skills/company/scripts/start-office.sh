#!/bin/sh
# Agent Company 내장 오피스 대시보드를 로컬 HTTP 서버로 실행한다.
set -eu

HOST=127.0.0.1
PORT=auto
FOREGROUND=0
PROJECT_DIR=

usage() {
  echo "Usage: start-office.sh --project-dir <project_path> [--host 127.0.0.1|0.0.0.0] [--port auto] [--foreground]"
}

fail() {
  echo "$1" >&2
  exit 1
}

read_url() {
  if [ -f "$1" ]; then
    sed -n 's/^[[:space:]]*"url": "\(.*\)",[[:space:]]*$/\1/p' "$1" | sed -n '1p'
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-dir)
      shift
      [ "$#" -gt 0 ] || fail "--project-dir requires a value"
      PROJECT_DIR=$1
      ;;
    --host)
      shift
      [ "$#" -gt 0 ] || fail "--host requires a value"
      HOST=$1
      ;;
    --port)
      shift
      [ "$#" -gt 0 ] || fail "--port requires a value"
      PORT=$1
      ;;
    --foreground)
      FOREGROUND=1
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

[ -n "$PROJECT_DIR" ] || fail "--project-dir is required"
RAW_PROJECT_DIR=$PROJECT_DIR
if ! PROJECT_DIR=$(CDPATH= cd -- "$RAW_PROJECT_DIR" && pwd); then
  fail "Project directory does not exist: $RAW_PROJECT_DIR"
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
OFFICE_INDEX="$PLUGIN_ROOT/office/dist/index.html"

[ -f "$OFFICE_INDEX" ] || fail "Missing Agent Company office build at $OFFICE_INDEX. Run npm run build:agent-office first."

OFFICE_STATE_DIR="$PROJECT_DIR/.agent-company/office"
PID_FILE="$OFFICE_STATE_DIR/server.pid"
INFO_FILE="$OFFICE_STATE_DIR/server-info.json"
LOG_FILE="$OFFICE_STATE_DIR/server.log"

mkdir -p "$OFFICE_STATE_DIR"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    URL=$(read_url "$INFO_FILE")
    if [ -n "$URL" ]; then
      echo "Agent Company office already running at $URL"
    else
      echo "Agent Company office already running with pid $PID"
    fi
    exit 0
  fi
  rm -f "$PID_FILE" "$INFO_FILE"
fi

if [ "$FOREGROUND" -eq 1 ]; then
  exec node --experimental-strip-types "$PLUGIN_ROOT/server/src/office-server.ts" \
    --project-dir "$PROJECT_DIR" \
    --host "$HOST" \
    --port "$PORT"
fi

rm -f "$INFO_FILE"
nohup node --experimental-strip-types "$PLUGIN_ROOT/server/src/office-server.ts" \
  --project-dir "$PROJECT_DIR" \
  --host "$HOST" \
  --port "$PORT" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

WAIT_COUNT=0
while [ "$WAIT_COUNT" -lt 100 ]; do
  if [ -f "$INFO_FILE" ]; then
    URL=$(read_url "$INFO_FILE")
    echo "Agent Company office running at $URL"
    echo "PID: $SERVER_PID"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    rm -f "$PID_FILE" "$INFO_FILE"
    echo "Agent Company office server failed to start. Log: $LOG_FILE" >&2
    tail -n 40 "$LOG_FILE" >&2 || true
    exit 1
  fi
  WAIT_COUNT=$((WAIT_COUNT + 1))
  sleep 0.1
done

echo "Agent Company office server did not report readiness. Log: $LOG_FILE" >&2
kill "$SERVER_PID" 2>/dev/null || true
rm -f "$PID_FILE" "$INFO_FILE"
tail -n 40 "$LOG_FILE" >&2 || true
exit 1
