import type { LocalIntegrationRepository } from "../repository/local";
import type { UlviaPaths } from "../runtime/paths";

export async function statusCommand(
    paths: UlviaPaths,
    repository: LocalIntegrationRepository,
    log: (message: string) => void,
): Promise<void> {
    const records = await repository.list();
    log(`Data directory: ${paths.data}`);
    log(`Local repository: ${records.length} package${records.length === 1 ? "" : "s"}`);
    for (const record of records) {
        log(`  ${record.kind}@${record.version}  sha256:${record.digest.slice(0, 12)}`);
    }
}
