import { join } from "node:path";
import { rm, open } from "node:fs/promises";
import { atomicPrivateWrite } from "../stack/orchestration/deployment/storage";
import type { UlviaPaths } from "../paths";
import type { LocalServicesState } from "../stack/orchestration/state";
const marker = (paths: UlviaPaths) => join(paths.services, "credentials/maintenance.json");
export async function pauseProvider(paths: UlviaPaths) {
    await atomicPrivateWrite(marker(paths), JSON.stringify({ schema: "ulvia.maintenance-gate/v1" }));
}
export async function releaseProvider(paths: UlviaPaths) {
    await rm(marker(paths), { force: true });
    const directory = await open(join(paths.services, "credentials"), "r");
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}
export async function activateProvider(paths: UlviaPaths, target: LocalServicesState) {
    await releaseProvider(paths);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${target.installation.ports.provider}/readyz`, {
                redirect: "error",
                signal: AbortSignal.timeout(1000),
            });
            await response.body?.cancel();
            if (response.status === 204 && response.headers.get("ulvia-maintenance") === "active") {
                return;
            }
        } catch {
            /* Retry the already committed activation. */
        }
        await Bun.sleep(100);
    }
    throw new Error("Provider activation is pending; resume ulvia upgrade. Automatic rollback is no longer permitted");
}
