import type { LocalIntegrationRepository } from "../repository/local";
import { auditLocalRelease } from "../release/audit";
import { listLocalReleaseKinds } from "../release/source";
import type { LocalReleaseVerifier } from "../release/types";
import { parseSourceCommandFlags } from "./source-flags";
import { importLocalPackageSeed } from "../repository/seed";

export async function auditCommand(
    args: readonly string[],
    cwd: string,
    local: LocalIntegrationRepository,
    verifier: LocalReleaseVerifier,
    log: (message: string) => void,
): Promise<void> {
    const flags = parseSourceCommandFlags("audit", args, cwd, { allowAll: true });
    const imported = await importLocalPackageSeed(flags.root, local);
    if (imported) {
        log(`+ imported ${imported} immutable historical package(s) from the local source tree`);
    }
    const kinds = flags.all ? await listLocalReleaseKinds(flags.root) : [flags.kind!];
    const failures: { kind: string; error: unknown }[] = [];
    for (const kind of kinds) {
        try {
            const result = await auditLocalRelease(flags.root, kind, flags.version, { local, verifier, log });
            const { version } = result.prepared.candidate.package.envelope;
            log(`✓ ${kind}@${version} audit passed (${result.scenarioCount} scenario(s))`);
        } catch (error) {
            if (!flags.all) {
                throw error;
            }
            failures.push({ kind, error });
            log(`✗ ${kind}: ${errorMessage(error)}`);
        }
    }
    if (failures.length) {
        throw new Error(`Audit failed for ${failures.length} of ${kinds.length} integration(s)`);
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
