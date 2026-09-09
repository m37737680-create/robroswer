#!/bin/bash
set -u

echo "Importing FluxCP schemas..."

for schema_file in /fluxcp-schemas/logindb/*.sql /fluxcp-schemas/charmapdb/*.sql; do
    [ -f "$schema_file" ] || continue
    echo "Importing FluxCP schema: $schema_file"
    mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < "$schema_file" || \
        echo "Skipping incompatible FluxCP schema update: $schema_file"
done

ensure_column() {
    table="$1"
    column="$2"
    definition="$3"

    exists="$(mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" -N \
        -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$MYSQL_DATABASE' AND table_name='$table' AND column_name='$column';")"
    if [ "$exists" = "0" ]; then
        echo "Adding missing FluxCP column: $table.$column"
        mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
            -e "ALTER TABLE \`$table\` ADD \`$column\` $definition;"
    fi
}

ensure_column cp_itemshop category "INT(11) NULL AFTER \`nameid\`"
ensure_column cp_itemshop use_existing "TINYINT NOT NULL DEFAULT '0' AFTER \`info\`"
ensure_column cp_redeemlog credits_before "INT(10) NOT NULL AFTER \`purchase_date\`"
ensure_column cp_redeemlog credits_after "INT(10) NOT NULL AFTER \`credits_before\`"
