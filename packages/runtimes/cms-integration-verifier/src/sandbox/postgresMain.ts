import { runCanonicalVerificationSandboxProgram } from "./program";
import { runPostgresPlatformVerification } from "./postgres";
import { loadPostgresPlatformVerificationAdapter } from "./postgresAdapter";

export async function runPostgresVerificationSandboxExecutable(arguments_: readonly string[] = process.argv.slice(2)) {
    const [adapterModule] = arguments_;
    if (!adapterModule || arguments_.length !== 1) {
        throw new TypeError("PostgreSQL sandbox requires one adapter module");
    }
    const adapter = await loadPostgresPlatformVerificationAdapter(adapterModule);
    try {
        await runCanonicalVerificationSandboxProgram(
            async (input, signal) => await runPostgresPlatformVerification(input, adapter, signal),
        );
    } finally {
        await adapter.dispose?.();
    }
}

if (import.meta.main) {
    try {
        await runPostgresVerificationSandboxExecutable();
    } catch {
        process.stderr.write('{"event":"postgres-verification-sandbox-failed"}\n');
        process.exitCode = 1;
    }
}
