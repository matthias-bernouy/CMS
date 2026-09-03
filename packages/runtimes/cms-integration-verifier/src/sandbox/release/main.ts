import { runCanonicalVerificationSandboxProgram } from "../program";
import { runReleaseRuntimeVerification } from ".";

export async function runReleaseRuntimeSandboxExecutable(): Promise<void> {
    await runCanonicalVerificationSandboxProgram(
        async (input, signal) => await runReleaseRuntimeVerification(input, signal),
        { maxInputBytes: 40 * 1_048_576, validation: "structure" },
    );
}

if (import.meta.main) {
    try {
        await runReleaseRuntimeSandboxExecutable();
    } catch {
        process.stderr.write('{"event":"release-runtime-sandbox-failed"}\n');
        process.exitCode = 1;
    }
}
