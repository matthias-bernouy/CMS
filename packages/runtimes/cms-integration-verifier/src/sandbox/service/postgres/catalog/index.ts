import { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type {
    BoundarySnapshot,
    CatalogFingerprintRow,
    GrantObservation,
    RlsObservation,
    RoutineObservation,
    ViewObservation,
} from "../types";
import {
    BOUNDARY_CATALOG_QUERY,
    GRANTS_QUERY,
    RLS_POLICIES_QUERY,
    RLS_RELATIONS_QUERY,
    ROUTINES_QUERY,
    VIEWS_QUERY,
} from "./queries";

export async function readBoundarySnapshot(
    database: SQL,
    ownedNamespaces: readonly string[],
): Promise<BoundarySnapshot> {
    const parameters = [database.array([...ownedNamespaces], "TEXT")];
    const rows = (await database.unsafe(BOUNDARY_CATALOG_QUERY, parameters)) as CatalogFingerprintRow[];
    const tables = rows.filter((row) => row.objectType === "relation" && row.definition.startsWith("r\u001f"));
    const data = await Promise.all(
        tables.map(async (table) => ({
            objectType: "table-data",
            namespace: table.namespace,
            identity: table.identity,
            definition: await tableDigest(database, table.namespace, table.identity),
        })),
    );
    const normalized = [...rows, ...data].toSorted(compareCatalogRows);
    return Object.freeze({ digest: await sha256Hex(canonicalJsonBytes(normalized)), rows: normalized });
}

export async function readRlsObservation(database: SQL, schemas: readonly string[]): Promise<RlsObservation> {
    const parameters = [database.array([...schemas], "TEXT")];
    const relationRows = (await database.unsafe(RLS_RELATIONS_QUERY, parameters)) as RlsObservation["relations"];
    const policyRows = (await database.unsafe(RLS_POLICIES_QUERY, parameters)) as Array<{
        namespace: string;
        relation: string;
        name: string;
        command: string;
        roles: string[];
        permissive: boolean;
        usingExpression: string | null;
        checkExpression: string | null;
    }>;
    return {
        relations: relationRows.map((entry) => ({
            namespace: entry.namespace,
            relation: entry.relation,
            kind: entry.kind,
            rlsEnabled: entry.rlsEnabled,
            rlsForced: entry.rlsForced,
        })),
        policies: policyRows.map((entry) => ({
            namespace: entry.namespace,
            relation: entry.relation,
            name: entry.name,
            command: entry.command,
            roles: [...entry.roles],
            permissive: entry.permissive,
            ...(entry.usingExpression === null ? {} : { usingExpression: entry.usingExpression }),
            ...(entry.checkExpression === null ? {} : { checkExpression: entry.checkExpression }),
        })),
    };
}

export async function readGrantObservation(database: SQL, schemas: readonly string[]): Promise<GrantObservation[]> {
    const rows = (await database.unsafe(GRANTS_QUERY, [database.array([...schemas], "TEXT")])) as GrantObservation[];
    return rows.map((entry) => ({ ...entry }));
}

export async function readViewObservation(database: SQL, schemas: readonly string[]): Promise<ViewObservation[]> {
    const rows = (await database.unsafe(VIEWS_QUERY, [database.array([...schemas], "TEXT")])) as ViewObservation[];
    return rows.map((entry) => ({ ...entry, selectGrantees: [...entry.selectGrantees] }));
}

export async function readRoutineObservation(database: SQL, schemas: readonly string[]): Promise<RoutineObservation[]> {
    const rows = (await database.unsafe(ROUTINES_QUERY, [
        database.array([...schemas], "TEXT"),
    ])) as RoutineObservation[];
    return rows.map((entry) => ({
        ...entry,
        configuration: [...entry.configuration],
        executeGrantees: [...entry.executeGrantees],
    }));
}

function compareCatalogRows(left: CatalogFingerprintRow, right: CatalogFingerprintRow): number {
    return `${left.objectType}\0${left.namespace}\0${left.identity}`.localeCompare(
        `${right.objectType}\0${right.namespace}\0${right.identity}`,
    );
}

async function tableDigest(database: SQL, namespace: string, table: string): Promise<string> {
    const identifier = `${quoteIdentifier(namespace)}.${quoteIdentifier(table)}`;
    const [row] = (await database.unsafe(
        `select count(*)::text as count, md5(coalesce(string_agg(value, E'\\n' order by value), '')) as digest
         from (select to_jsonb(entry)::text as value from ${identifier} as entry) as rows`,
    )) as Array<{ count: string; digest: string }>;
    return `${row?.count ?? "0"}\0${row?.digest ?? ""}`;
}

function quoteIdentifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}
