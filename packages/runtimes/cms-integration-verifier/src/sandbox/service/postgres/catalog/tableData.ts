import type { SQL } from "bun";
import type { CatalogFingerprintRow } from "../types";

export type TableDataProjection = Readonly<{
    kind: "database-clock-default";
    namespace: string;
    relation: string;
    columns: readonly string[];
    primaryKeyColumns: readonly string[];
}>;

type TableObservationTarget = Readonly<{
    namespace: string;
    identity: string;
    forceRowSecurity: boolean;
    projection?: TableDataProjection;
}>;

export async function readTableDataRows(
    database: SQL,
    catalog: readonly CatalogFingerprintRow[],
    projections: readonly TableDataProjection[],
): Promise<CatalogFingerprintRow[]> {
    const byRelation = new Map(projections.map((entry) => [projectionKey(entry.namespace, entry.relation), entry]));
    if (byRelation.size !== projections.length) {
        throw new TypeError("Migration data equivalence contains duplicate relation projections");
    }
    const observedProjections = new Set<string>();
    const data: CatalogFingerprintRow[] = [];
    for (const table of catalog.flatMap((row) => tableObservationTarget(row, byRelation))) {
        if (table.projection) {
            observedProjections.add(projectionKey(table.namespace, table.identity));
        }
        data.push({
            objectType: "table-data",
            namespace: table.namespace,
            identity: table.identity,
            definition: await tableDigest(database, table),
        });
    }
    if (observedProjections.size !== projections.length) {
        throw new Error("Migration data equivalence projection does not identify an observed table");
    }
    return data;
}

function tableObservationTarget(
    row: CatalogFingerprintRow,
    projections: ReadonlyMap<string, TableDataProjection>,
): TableObservationTarget[] {
    if (row.objectType !== "relation") {
        return [];
    }
    const [kind, _owner, _rowSecurity, forceRowSecurity] = row.definition.split("\u001f");
    if (kind !== "r" && kind !== "p") {
        return [];
    }
    return [
        {
            namespace: row.namespace,
            identity: row.identity,
            forceRowSecurity: forceRowSecurity === "true",
            ...(projections.get(projectionKey(row.namespace, row.identity))
                ? { projection: projections.get(projectionKey(row.namespace, row.identity))! }
                : {}),
        },
    ];
}

async function tableDigest(database: SQL, table: TableObservationTarget): Promise<string> {
    const identifier = `${quoteIdentifier(table.namespace)}.${quoteIdentifier(table.identity)}`;
    if (table.forceRowSecurity) {
        await database.unsafe(`ALTER TABLE ${identifier} NO FORCE ROW LEVEL SECURITY`);
    }
    try {
        if (table.projection) {
            await assertProjectionCatalog(database, table.projection);
            return await readProjectedTableDigest(database, identifier, table.projection);
        }
        return await readRawTableDigest(database, identifier);
    } finally {
        if (table.forceRowSecurity) {
            await database.unsafe(`ALTER TABLE ${identifier} FORCE ROW LEVEL SECURITY`);
        }
    }
}

async function assertProjectionCatalog(database: SQL, projection: TableDataProjection): Promise<void> {
    const columns = (await database.unsafe(
        `select attribute.attname::text as name,
                attribute.atttypid in ('timestamp'::regtype::oid, 'timestamptz'::regtype::oid) as "validType",
                attribute.attnotnull as "notNull",
                coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false), '')::text
                    as "defaultValue"
           from pg_catalog.pg_attribute attribute
           join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
           join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
           left join pg_catalog.pg_attrdef default_value
             on default_value.adrelid = relation.oid and default_value.adnum = attribute.attnum
          where namespace.nspname = $1 and relation.relname = $2 and relation.relkind in ('r', 'p')
            and attribute.attname = any($3::text[]) and attribute.attnum > 0 and not attribute.attisdropped
          order by attribute.attname collate "C"`,
        [projection.namespace, projection.relation, database.array([...projection.columns], "TEXT")],
    )) as Array<{ name: string; validType: boolean; notNull: boolean; defaultValue: string }>;
    const primaryKey = (await database.unsafe(
        `select attribute.attname::text as name
           from pg_catalog.pg_constraint constraint_row
           join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
           join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
           cross join lateral unnest(constraint_row.conkey) with ordinality as key(attnum, position)
           join pg_catalog.pg_attribute attribute
             on attribute.attrelid = relation.oid and attribute.attnum = key.attnum
          where namespace.nspname = $1 and relation.relname = $2 and constraint_row.contype = 'p'
          order by key.position`,
        [projection.namespace, projection.relation],
    )) as Array<{ name: string }>;
    if (
        columns.length !== projection.columns.length ||
        columns.some(
            (entry, index) =>
                entry.name !== projection.columns[index] ||
                !entry.validType ||
                !entry.notNull ||
                (entry.defaultValue !== "now()" && entry.defaultValue !== "CURRENT_TIMESTAMP"),
        ) ||
        primaryKey.length !== projection.primaryKeyColumns.length ||
        primaryKey.some((entry, index) => entry.name !== projection.primaryKeyColumns[index])
    ) {
        throw new Error("Database-clock data projection does not match the observed table contract");
    }
}

async function readProjectedTableDigest(
    database: SQL,
    identifier: string,
    projection: TableDataProjection,
): Promise<string> {
    const key = `jsonb_build_array(${projection.primaryKeyColumns
        .map((column) => `entry.${quoteIdentifier(column)}`)
        .join(", ")})::text`;
    const value = projection.columns.reduce(
        (expression, column) => `${expression} - ${quoteLiteral(column)}`,
        "to_jsonb(entry)",
    );
    const valid = projection.columns.map((column) => `entry.${quoteIdentifier(column)} IS NOT NULL`).join(" AND ");
    const [row] = (await database.unsafe(
        `select count(*)::text as count,
                encode(extensions.digest(coalesce(string_agg(concat("rowKey", chr(31), value), E'\\n'
                    order by "rowKey" collate "C"), ''), 'sha256'), 'hex') as digest,
                coalesce(bool_and(valid), true) as valid
           from (select ${key} as "rowKey", (${value})::text as value, (${valid}) as valid
                   from ${identifier} as entry) as rows`,
    )) as Array<{ count: string; digest: string; valid: boolean }>;
    if (!row?.valid) {
        throw new Error("Database-clock data projection observed a null projected value");
    }
    return `${row.count}\0${row.digest}`;
}

async function readRawTableDigest(database: SQL, identifier: string): Promise<string> {
    const [row] = (await database.unsafe(
        `select count(*)::text as count,
                encode(extensions.digest(coalesce(string_agg(value, E'\\n' order by value), ''), 'sha256'), 'hex')
                    as digest
         from (select to_jsonb(entry)::text as value from ${identifier} as entry) as rows`,
    )) as Array<{ count: string; digest: string }>;
    return `${row?.count ?? "0"}\0${row?.digest ?? ""}`;
}

function projectionKey(namespace: string, relation: string): string {
    return `${namespace}\0${relation}`;
}

function quoteIdentifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}
