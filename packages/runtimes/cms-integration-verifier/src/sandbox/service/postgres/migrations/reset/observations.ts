import { SQL } from "bun";
import { sha256Hex } from "@bernouy/cms-integration-packages";
import { CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1 } from "@bernouy/cms-integration-verification";

const CONTRACT = CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1;

type BootstrapObservation = Readonly<{
    contract: string;
    schemas: readonly string[];
    storageBuckets: Readonly<{ columns: readonly string[]; constraints: readonly string[] }>;
    extensionGuard: Readonly<{ eventTrigger: string; function: string; sourceDigest: string }>;
    extensionsUsageGranted: boolean;
}>;

export async function observePostgres(database: SQL): Promise<{ version: string; imageDigest: string }> {
    const rows = (await database.unsafe(`select current_setting('server_version')::text as version,
      current_setting('server_version_num')::text as "versionNumber"`)) as Array<{
        version: string;
        versionNumber: string;
    }>;
    const row = rows[0];
    if (rows.length !== 1 || !row || row.versionNumber !== "160014") {
        environmentMismatch();
    }
    return { version: row.version, imageDigest: CONTRACT.postgres.imageDigest };
}

export async function observeBootstrap(database: SQL): Promise<BootstrapObservation> {
    const schemas = (await database.unsafe(`select nspname::text as name from pg_catalog.pg_namespace
      where nspname !~ '^pg_' and nspname <> 'information_schema' order by nspname collate "C"`)) as Array<{
        name: string;
    }>;
    const columns = (await database.unsafe(`select attribute.attname::text as name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)::text as type,
      attribute.attnotnull as "notNull",
      coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false), '')::text as "defaultValue"
      from pg_catalog.pg_attribute attribute
      join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      left join pg_catalog.pg_attrdef default_value
        on default_value.adrelid = relation.oid and default_value.adnum = attribute.attnum
      where namespace.nspname = 'storage' and relation.relname = 'buckets'
        and attribute.attnum > 0 and not attribute.attisdropped
      order by attribute.attname collate "C"`)) as Array<{
        name: string;
        type: string;
        notNull: boolean;
        defaultValue: string;
    }>;
    const constraints = (await database.unsafe(`select constraint_row.conname::text as name,
      pg_catalog.pg_get_constraintdef(constraint_row.oid, false)::text as definition
      from pg_catalog.pg_constraint constraint_row
      join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'storage' and relation.relname = 'buckets'
      order by constraint_row.conname collate "C"`)) as Array<{ name: string; definition: string }>;
    const guards = (await database.unsafe(`select trigger.evtname::text as trigger,
      trigger.evtevent::text as event, trigger.evttags::text[] as tags,
      trigger.evtenabled::text as enabled, namespace.nspname::text as namespace,
      procedure.proname::text as function, procedure.prosecdef as "securityDefiner",
      coalesce(array_to_string(procedure.proconfig, ','), '')::text as configuration,
      procedure.prosrc::text as source
      from pg_catalog.pg_event_trigger trigger
      join pg_catalog.pg_proc procedure on procedure.oid = trigger.evtfoid
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      where trigger.evtname = 'cms_verifier_extension_allowlist'`)) as Array<{
        trigger: string;
        event: string;
        tags: string[];
        enabled: string;
        namespace: string;
        function: string;
        securityDefiner: boolean;
        configuration: string;
        source: string;
    }>;
    const guard = guards[0];
    if (guards.length !== 1 || !guard) {
        environmentMismatch();
    }
    const usage = (await database.unsafe(
        "select pg_catalog.has_schema_privilege(current_user, 'extensions', 'USAGE') as granted",
    )) as Array<{ granted: boolean }>;
    return {
        contract: CONTRACT.bootstrap.contract,
        schemas: schemas.map(({ name }) => name),
        storageBuckets: {
            columns: columns.map(
                (entry) =>
                    `${entry.name}:${entry.type}:${entry.notNull ? "not-null" : "nullable"}:${entry.defaultValue}`,
            ),
            constraints: constraints.map((entry) => `${entry.name}:${entry.definition}`),
        },
        extensionGuard: {
            eventTrigger: `${guard.trigger}:${guard.event}:${guard.tags.toSorted().join(",")}:${guard.enabled}`,
            function: `${guard.namespace}.${guard.function}():${guard.securityDefiner ? "security-definer" : "invoker"}:${guard.configuration.replace("search_path=", "")}`,
            sourceDigest: await sha256Hex(new TextEncoder().encode(guard.source)),
        },
        extensionsUsageGranted: usage.length === 1 && usage[0]?.granted === true,
    };
}

export async function observeRoles(database: SQL): Promise<Array<{ name: string; attributes: string[] }>> {
    const names = CONTRACT.roles.map(({ name }) => name);
    const rows = (await database.unsafe(
        `select rolname::text as name, rolcanlogin as login, rolbypassrls as "bypassRls",
          rolsuper, rolcreatedb, rolcreaterole, rolreplication
          from pg_catalog.pg_roles where rolname = any($1::text[]) order by rolname collate "C"`,
        [database.array(names, "TEXT")],
    )) as Array<{
        name: string;
        login: boolean;
        bypassRls: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
    }>;
    if (
        rows.length !== names.length ||
        rows.some((row) => row.login || row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolreplication)
    ) {
        environmentMismatch();
    }
    return rows.map((row) => ({
        name: row.name,
        attributes: [row.bypassRls ? "bypassrls" : "no-bypassrls", "no-login"],
    }));
}

export async function observeExtensions(database: SQL): Promise<Array<{ name: string; version: string }>> {
    const rows = (await database.unsafe(`select extension.extname::text as name,
      extension.extversion::text as version, namespace.nspname::text as namespace
      from pg_catalog.pg_extension extension
      join pg_catalog.pg_namespace namespace on namespace.oid = extension.extnamespace
      where extension.extname <> 'plpgsql' order by extension.extname collate "C"`)) as Array<{
        name: string;
        version: string;
        namespace: string;
    }>;
    if (rows.some((row) => row.namespace !== "extensions")) {
        environmentMismatch();
    }
    return rows.map(({ name, version }) => ({ name, version }));
}

export async function observeSessionSettings(database: SQL): Promise<Array<{ name: string; value: string }>> {
    const rows = (await database.unsafe("select current_setting('search_path')::text as value")) as Array<{
        value: string;
    }>;
    if (rows.length !== 1 || !rows[0]) {
        environmentMismatch();
    }
    const value = rows[0].value
        .split(",")
        .map((entry) => entry.trim().replaceAll('"', ""))
        .join(",");
    return [{ name: "search_path", value }];
}

export function environmentMismatch(): never {
    throw new TypeError("Migration verification environment does not match the attested PostgreSQL contract");
}
