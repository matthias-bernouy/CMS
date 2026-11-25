import { join, isAbsolute, resolve } from "node:path";
import { rm, open } from "node:fs/promises";
import { atomicPrivateWrite, readPrivateFile } from "../stack/orchestration/deployment/storage";
import { parseDeploymentState } from "../stack/orchestration/state";
import type { UlviaPaths } from "../paths";
import type { LocalServicesState, DeploymentState } from "../stack/orchestration/state";
type MaintenancePhase =
    | "quiescing"
    | "backup"
    | "planning"
    | "migrating"
    | "deploying"
    | "opening"
    | "rollback-stopping"
    | "rollback-restoring"
    | "rollback-opening";
export type MaintenanceJournal = {
    schema: "ulvia.maintenance/v1";
    kind: "upgrade" | "restore";
    phase: MaintenancePhase;
    backup: string;
    applied: LocalServicesState;
    target: LocalServicesState | null;
    previous: DeploymentState | null;
};
const phases: readonly MaintenancePhase[] = [
    "quiescing",
    "backup",
    "planning",
    "migrating",
    "deploying",
    "opening",
    "rollback-stopping",
    "rollback-restoring",
    "rollback-opening",
];
export async function readMaintenance(paths: UlviaPaths): Promise<MaintenanceJournal | null> {
    const text = await readPrivateFile(join(paths.data, ".maintenance.json"), 4 * 1024 * 1024);
    if (text === null) {
        return null;
    }
    const row = JSON.parse(text) as MaintenanceJournal;
    if (
        !row ||
        Object.keys(row).sort().join(",") !== "applied,backup,kind,phase,previous,schema,target" ||
        row.schema !== "ulvia.maintenance/v1" ||
        !["upgrade", "restore"].includes(row.kind) ||
        !phases.includes(row.phase) ||
        (row.kind === "upgrade" && (!row.target || !row.previous)) ||
        (row.kind === "restore" && (row.target !== null || !row.phase.startsWith("rollback-"))) ||
        typeof row.backup !== "string" ||
        !isAbsolute(row.backup) ||
        resolve(row.backup) !== row.backup ||
        !row.applied ||
        !row.applied.images ||
        !(row.target === null || typeof row.target === "object") ||
        !(row.previous === null || typeof row.previous === "object")
    ) {
        throw new Error("Maintenance journal is invalid; explicit operator recovery is required");
    }
    parseDeploymentState(
        paths,
        JSON.stringify({
            schema: "ulvia.local-services-stack.v1",
            applied: row.applied,
            operation: row.target ? { kind: "upgrade", phase: "prepared", target: row.target } : null,
        }),
    );
    if (row.previous) {
        parseDeploymentState(paths, JSON.stringify(row.previous));
    }
    return row;
}
export async function saveMaintenance(paths: { data: string }, row: MaintenanceJournal) {
    await atomicPrivateWrite(join(paths.data, ".maintenance.json"), JSON.stringify(row));
}
export async function clearMaintenance(paths: { data: string }) {
    await rm(join(paths.data, ".maintenance.json"), { force: true });
    const directory = await open(paths.data, "r");
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}
export async function guardMaintenance(paths: UlviaPaths, command: string) {
    const row = await readMaintenance(paths);
    if (row && !["status", "logs", "backup", "upgrade"].includes(command)) {
        throw new Error(
            `Maintenance ${row.kind} is incomplete (${row.phase}). Run ulvia ${row.kind === "upgrade" ? "upgrade" : `backup restore ${row.backup} --yes`} to resume.`,
        );
    }
    return row;
}
