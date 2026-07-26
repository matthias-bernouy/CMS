import { runCanonicalVerificationSandboxProgram } from "./program";
import { runPostgresInstallAndReapply } from "./postgres";
import { loadPostgresInstallAndReapplyAdapter } from "./postgresAdapter";

const SUITE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export async function runPostgresVerificationSandboxExecutable(arguments_: readonly string[] = process.argv.slice(2)) {
    const [adapterModule, suiteId] = arguments_;
    if (!adapterModule || !suiteId || !SUITE_ID.test(suiteId) || arguments_.length !== 2) {
        throw new TypeError("PostgreSQL sandbox requires one adapter module and one suite identity");
    }
    const adapter = await loadPostgresInstallAndReapplyAdapter(adapterModule);
    await runCanonicalVerificationSandboxProgram(
        async (input, signal) => await runPostgresInstallAndReapply(input, adapter, suiteId, signal),
    );
}

if (import.meta.main) {
    try {
        await runPostgresVerificationSandboxExecutable();
    } catch {
        process.stderr.write('{"event":"postgres-verification-sandbox-failed"}\n');
        process.exitCode = 1;
    }
}
