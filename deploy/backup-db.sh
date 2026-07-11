#!/bin/bash
# K-RECA POS - Daily PostgreSQL Backup
# Add to crontab:
#   0 3 * * * /var/www/kareca/deploy/backup-db.sh

BACKUP_DIR="/var/backups/kareca"
DB_NAME="kareca_db"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

pg_dump "$DB_NAME" | gzip > "$BACKUP_DIR/$FILENAME"

find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$(date)] Backup created: $FILENAME"
echo "[$(date)] Old backups cleaned (retention: $RETENTION_DAYS days)"
