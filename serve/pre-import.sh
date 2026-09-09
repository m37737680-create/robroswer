#!/bin/bash
set -e

DB_HOST="${MYSQL_HOST:-db}"
DB_NAME="${MYSQL_DATABASE:-ragnarok}"
DB_USER="${MYSQL_USER:-ragnarok}"
DB_PASSWORD="${MYSQL_PASSWORD:-ragnarok}"

until mysqladmin ping -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" --silent; do
    sleep 2
done

cd /rathena

if ! grep -q '^REPLACE INTO' sql-files/item_db.sql 2>/dev/null ||
   ! grep -q '^REPLACE INTO' sql-files/mob_db.sql 2>/dev/null; then
    mkdir -p /tmp/pre-renewal-bin
    printf '#!/bin/sh\nexec /usr/bin/g++ -DPRERE -DCONVERT_ALL "$@"\n' > /tmp/pre-renewal-bin/g++
    chmod +x /tmp/pre-renewal-bin/g++
    export PATH="/tmp/pre-renewal-bin:$PATH"
    rm -f yaml2sql src/tool/obj_all/yaml2sql.o
    make -C src/tool yaml2sql
    ./yaml2sql
fi

table_rows() {
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -N \
        -e "SELECT table_rows FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='$1';"
}

import_if_empty() {
    table="$1"
    shift
    rows="$(table_rows "$table")"
    if [ -z "$rows" ] || [ "$rows" = "0" ]; then
        for sql_file in "$@"; do
            mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "/rathena/sql-files/$sql_file"
        done
    fi
}

import_if_empty item_db \
    item_db.sql item_db_usable.sql item_db_equip.sql item_db_etc.sql item_db2.sql
import_if_empty mob_db mob_db.sql mob_db2.sql
