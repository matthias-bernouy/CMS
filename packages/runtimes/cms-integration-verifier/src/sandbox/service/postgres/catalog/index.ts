import { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type {
    BoundarySnapshot,
    CatalogFingerprintRow,
    GrantObservation,
    RoleMembershipObservation,
    RlsObservation,
    RoutineObservation,
    UnknownSurfaceObservation,
    ViewObservation,
} from "../types";
import { GRANTS_QUERY } from "./accessQueries";
import { BOUNDARY_CATALOG_QUERY } from "./queries";
import {
    RLS_POLICIES_QUERY,
    RLS_RELATIONS_QUERY,
    ROLE_MEMBERSHIPS_QUERY,
    ROUTINES_QUERY,
    UNKNOWN_SURFACES_QUERY,
    VIEWS_QUERY,
} from "./policyQueries";
import { readTableDataRows, type TableDataProjection } from "./tableData";

export type { TableDataProjection } from "./tableData";

export async function readBoundarySnapshot(
    database: SQL,
    ownedNamespaces: readonly string[],
    dataProjections: readonly TableDataProjection[] = [],
): Promise<BoundarySnapshot> {
    const parameters = [database.array([...ownedNamespaces], "TEXT")];
    const rows = (await database.unsafe(BOUNDARY_CATALOG_QUERY, parameters)) as CatalogFingerprintRow[];
    const data = await readTableDataRows(database, rows, dataProjections);
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
            exposedRoles: [...entry.exposedRoles],
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

export async function readRoleMembershipObservation(database: SQL): Promise<RoleMembershipObservation[]> {
    const rows = (await database.unsafe(ROLE_MEMBERSHIPS_QUERY)) as RoleMembershipObservation[];
    return rows.map((entry) => ({ ...entry }));
}

export async function readUnknownSurfaceObservation(
    database: SQL,
    schemas: readonly string[],
): Promise<UnknownSurfaceObservation[]> {
    const rows = (await database.unsafe(UNKNOWN_SURFACES_QUERY, [
        database.array([...schemas], "TEXT"),
    ])) as UnknownSurfaceObservation[];
    return rows.map((entry) => ({ ...entry, exposedRoles: [...entry.exposedRoles] }));
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
