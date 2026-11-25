import { mkdir } from "node:fs/promises";
import { composeWorker } from "../stack/orchestration/compose";
import { deploymentProject } from "../stack/orchestration/deployment/artifacts";
import { pinnedOfficialImageReference } from "../stack/orchestration/images";
import { runCommand } from "../process";
import type { LocalServicesState } from "../stack/orchestration/state";
import type { UlviaPaths } from "../paths";
export type ReleaseMaintenancePlan = {
    schema: "ulvia.maintenance-plan/v1";
    digest: string;
    instances: number;
    forms: number;
    versions: number;
    submissions: number;
    migrations: string[];
};
export async function assertMaintenanceImage(state: LocalServicesState) {
    if (!state.release.files["services.yml"].includes("ULVIA_MAINTENANCE_FILE: /run/ulvia/maintenance.json")) {
        throw new Error("Target stack release does not configure maintenance API v1");
    }
    const result = await runCommand([
        "docker",
        "image",
        "inspect",
        pinnedOfficialImageReference(state.images.provider),
    ]);
    const rows = JSON.parse(result.stdout);
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.Config?.Labels?.["io.ulvia.maintenance-api"] !== "1") {
        throw new Error("Target image does not provide Ulvia maintenance API v1");
    }
}
export async function releaseMaintenance(
    paths: UlviaPaths,
    target: LocalServicesState,
    apply?: { digest: string; directory: string },
): Promise<ReleaseMaintenancePlan> {
    const project = await deploymentProject(paths, target),
        mount = apply?.directory;
    if (mount) {
        if (/[\r\n:,]/u.test(mount)) {
            throw new Error("Migration output directory contains unsupported mount characters");
        }
        await mkdir(mount, { mode: 0o700 });
    }
    const output = await composeWorker(project, [
        "run",
        "--rm",
        "--no-deps",
        ...(mount ? ["--volume", `${mount}:/migration:rw`] : []),
        "--entrypoint",
        "bun",
        "provider",
        "--no-macros",
        "run",
        "packages/runtimes/ulvia-provider-server/src/maintenance/upgrade.ts",
        ...(apply ? ["apply", apply.digest, "/migration"] : ["plan"]),
    ]);
    if (Buffer.byteLength(output.stdout) > 32768) {
        throw new Error("Maintenance response exceeds its byte bound");
    }
    const row = JSON.parse(output.stdout) as ReleaseMaintenancePlan;
    if (
        !row ||
        Object.keys(row).sort().join(",") !== "digest,forms,instances,migrations,schema,submissions,versions" ||
        row.schema !== "ulvia.maintenance-plan/v1" ||
        !/^[a-f0-9]{64}$/u.test(row.digest) ||
        ![row.instances, row.forms, row.versions, row.submissions].every(
            (value) => Number.isSafeInteger(value) && value >= 0,
        ) ||
        !Array.isArray(row.migrations) ||
        row.migrations.some((value) => value !== "forms-v1-to-v2")
    ) {
        throw new Error("Invalid release maintenance response");
    }
    return row;
}
