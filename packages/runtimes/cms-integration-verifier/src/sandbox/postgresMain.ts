import { runCanonicalVerificationSandboxProgram } from "./program";
import { runPostgresPlatformVerification, type PostgresPlatformVerificationAdapter } from "./postgres";
import { createPostgresPlatformVerificationAdapter } from "./service/postgres";

export async function runPostgresVerificationSandboxExecutable(
    adapter: PostgresPlatformVerificationAdapter = createPostgresPlatformVerificationAdapter(),
) {
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
