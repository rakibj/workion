#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="/tmp/docmost_backup_${TIMESTAMP}.dump"
RETAIN_COUNT=7

source "$SCRIPT_DIR/.env"

echo "[$(date)] Starting backup..."

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-docmost}" -d "${POSTGRES_DB:-docmost}" -Fc \
  > "$DUMP_FILE"

echo "[$(date)] Dump complete: $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"

AWS_ACCESS_KEY_ID="$AWS_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$AWS_S3_SECRET_ACCESS_KEY" \
aws s3 cp "$DUMP_FILE" \
  "s3://${AWS_S3_BUCKET}/backups/postgres/docmost_backup_${TIMESTAMP}.dump" \
  --endpoint-url "${AWS_S3_ENDPOINT}"

echo "[$(date)] Uploaded to R2."

rm "$DUMP_FILE"

# Delete dumps older than RETAIN_COUNT most recent
AWS_ACCESS_KEY_ID="$AWS_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$AWS_S3_SECRET_ACCESS_KEY" \
aws s3 ls "s3://${AWS_S3_BUCKET}/backups/postgres/" \
  --endpoint-url "${AWS_S3_ENDPOINT}" \
  | awk '{print $4}' \
  | sort \
  | head -n "-${RETAIN_COUNT}" \
  | while read -r old_key; do
      AWS_ACCESS_KEY_ID="$AWS_S3_ACCESS_KEY_ID" \
      AWS_SECRET_ACCESS_KEY="$AWS_S3_SECRET_ACCESS_KEY" \
      aws s3 rm "s3://${AWS_S3_BUCKET}/backups/postgres/${old_key}" \
        --endpoint-url "${AWS_S3_ENDPOINT}"
      echo "[$(date)] Deleted old backup: $old_key"
    done

echo "[$(date)] Backup done."
