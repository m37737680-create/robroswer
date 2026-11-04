#!/bin/bash
set -e

DB_HOST="${MYSQL_HOST:-db}"
DB_NAME="${MYSQL_DATABASE:-ragnarok}"
DB_USER="${MYSQL_USER:-ragnarok}"
DB_PASSWORD="${MYSQL_PASSWORD:-ragnarok}"
GAME_MODE="${GAME_MODE:-renewal}"
DB_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-ragnarok}"
SQL_FILES_DIR="/rathena/sql-files"
DB_SQL_FILES_DIR="/db-sql-files"

until mysqladmin ping -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" --silent; do
    sleep 2
done

cd /rathena

build_yaml2sql() {
    compiler_flags="$1"
    mkdir -p /tmp/pre-renewal-bin
    printf '#!/bin/sh\nexec /usr/bin/g++ %s "$@"\n' "$compiler_flags" > /tmp/pre-renewal-bin/g++
    chmod +x /tmp/pre-renewal-bin/g++
    export PATH="/tmp/pre-renewal-bin:$PATH"
    rm -f yaml2sql src/tool/obj_all/yaml2sql.o
    make -C src/tool yaml2sql
    ./yaml2sql
}

table_rows() {
    table="$1"
    exists="$(mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" -N \
        -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='$table';")"
    if [ "$exists" = "0" ]; then
        echo ""
    else
        mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" -N \
            -e "SELECT COUNT(*) FROM \`$table\`;"
    fi
}

ensure_table_schema() {
    table="$1"
    schema_file="$DB_SQL_FILES_DIR/$2"
    rows="$(table_rows "$table")"
    if [ -z "$rows" ]; then
        if [ ! -f "$schema_file" ]; then
            echo "Missing schema file for $table: $schema_file" >&2
            return 1
        fi
        echo "Creating missing database table $table from $schema_file"
        mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" < "$schema_file"
    fi
}

if [ "$GAME_MODE" = "pre-renewal" ] && {
   ! grep -q '^REPLACE INTO' sql-files/item_db.sql 2>/dev/null ||
   ! grep -q '^REPLACE INTO' sql-files/mob_db.sql 2>/dev/null;
}; then
    build_yaml2sql "-DPRERE -DCONVERT_ALL"
fi

if [ "$GAME_MODE" = "renewal" ]; then
    ensure_table_schema item_db_re item_db_re.sql
    ensure_table_schema item_db2_re item_db2_re.sql
    ensure_table_schema mob_db_re mob_db_re.sql
    ensure_table_schema mob_db2_re mob_db2_re.sql

    if ! grep -q '^REPLACE INTO' "$SQL_FILES_DIR/item_db_re_usable.sql" 2>/dev/null ||
       ! grep -q '^REPLACE INTO' "$SQL_FILES_DIR/item_db_re_equip.sql" 2>/dev/null ||
       ! grep -q '^REPLACE INTO' "$SQL_FILES_DIR/item_db_re_etc.sql" 2>/dev/null ||
       ! grep -q '^REPLACE INTO' "$SQL_FILES_DIR/mob_db_re.sql" 2>/dev/null; then
        build_yaml2sql "-DCONVERT_ALL"
    fi

    ai_width="$(mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" -N \
        -e "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns WHERE table_schema='$DB_NAME' AND table_name='mob_db_re' AND column_name='ai';")"
    if [ -z "$ai_width" ]; then
        echo "Renewal table mob_db_re.ai is missing" >&2
        exit 1
    fi
    if [ "$ai_width" -lt 50 ]; then
        mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
            -e "ALTER TABLE mob_db_re MODIFY ai VARCHAR(50) DEFAULT NULL;"
    fi
fi

import_if_empty() {
    table="$1"
    shift
    rows="$(table_rows "$table")"
    if [ -z "$rows" ] || [ "$rows" = "0" ]; then
        for sql_file in "$@"; do
            mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" < "/rathena/sql-files/$sql_file"
        done
    fi
}

import_if_empty item_db \
    item_db.sql item_db_usable.sql item_db_equip.sql item_db_etc.sql item_db2.sql
import_if_empty mob_db mob_db.sql mob_db2.sql

import_generated_data_if_incomplete() {
    table="$1"
    shift
    rows="$(table_rows "$table")"
    expected_rows=0
    for sql_file in "$@"; do
        file="$SQL_FILES_DIR/$sql_file"
        file_rows="$(grep -c '^REPLACE INTO' "$file" 2>/dev/null || true)"
        if [ "$file_rows" = "0" ] || [ -z "$file_rows" ]; then
            echo "No generated data found in $file" >&2
            return 1
        fi
        expected_rows=$((expected_rows + file_rows))
    done

    if [ -z "$rows" ] || [ "$rows" -lt "$expected_rows" ]; then
        for sql_file in "$@"; do
            grep '^REPLACE INTO' "$SQL_FILES_DIR/$sql_file" |
                sed 's/^REPLACE INTO/INSERT IGNORE INTO/' |
                mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME"
        done
    fi
}

if [ "$GAME_MODE" = "renewal" ]; then
    import_generated_data_if_incomplete item_db_re \
        item_db_re_usable.sql item_db_re_equip.sql item_db_re_etc.sql
    import_generated_data_if_incomplete mob_db_re mob_db_re.sql

    mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" <<'SQL'
CREATE TABLE IF NOT EXISTS `robrowser_sql_imports` (
    `file_name` varchar(255) NOT NULL,
    `sha256` char(64) NOT NULL,
    `imported_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (`file_name`)
) ENGINE=InnoDB;
SQL

    for sql_file in "$DB_SQL_FILES_DIR"/*.sql; do
        [ -f "$sql_file" ] || continue
        file_name="${sql_file##*/}"
        statements="$(mktemp)"
        if ! grep -E '^REPLACE INTO `(item_db_re|item_db2_re|mob_db_re|mob_db2_re)`' "$sql_file" > "$statements"; then
            rm -f "$statements"
            continue
        fi

        file_hash="$(sha256sum "$statements" | cut -d ' ' -f 1)"
        imported_hash="$(mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" -N \
            -e "SELECT sha256 FROM robrowser_sql_imports WHERE file_name='$file_name';")"
        if [ "$file_hash" != "$imported_hash" ]; then
            echo "Importing Renewal SQL data from $file_name"
            mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" < "$statements"
            mysql -h"$DB_HOST" -uroot -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
                -e "REPLACE INTO robrowser_sql_imports (file_name, sha256) VALUES ('$file_name', '$file_hash');"
        fi
        rm -f "$statements"
    done
fi
