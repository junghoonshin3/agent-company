#!/bin/sh
# Agent Company 내장 오피스 대시보드 서버를 종료한다.
set -eu

PROJECT_DIR=

usage() {
  echo "Usage: stop-office.sh --project-dir <project_path>"
}

fail() {
  echo "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-dir)
      shift
      [ "$#" -gt 0 ] || fail "--project-dir requires a value"
      PROJECT_DIR=$1
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

OFFICE_STATE_DIR="$PROJECT_DIR/.agent-company/office"
PID_FILE="$OFFICE_STATE_DIR/server.pid"
INFO_FILE="$OFFICE_STATE_DIR/server-info.json"

if [ ! -f "$PID_FILE" ]; then
  echo "Agent Company office server is not running."
  exit 0
fi

PID=$(cat "$PID_FILE" 2>/dev/null || true)
if [ -z "$PID" ]; then
  rm -f "$PID_FILE" "$INFO_FILE"
  echo "Removed stale Agent Company office pid file."
  exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE" "$INFO_FILE"
  echo "Removed stale Agent Company office pid file for pid $PID."
  exit 0
fi

kill "$PID"

WAIT_COUNT=0
while [ "$WAIT_COUNT" -lt 50 ]; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE" "$INFO_FILE"
    echo "Stopped Agent Company office server pid $PID."
    exit 0
  fi
  WAIT_COUNT=$((WAIT_COUNT + 1))
  sleep 0.1
done

echo "Agent Company office server pid $PID did not stop after SIGTERM." >&2
exit 1
