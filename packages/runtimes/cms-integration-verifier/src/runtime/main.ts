import { readIntegrationVerifierExecutableEnv } from "../config";
import { createProcessVerificationSandbox } from "../sandbox";
import { loadDisposableVerificationDatabaseProvider } from "./provider";
import { createProductionIntegrationVerifier } from "./production";
import { runVerificationPullLoop } from "./pullLoop";

export async function runIntegrationVerifierExecutable(
    source: Record<string, string | undefined> = process.env,
): Promise<void> {
    const env = readIntegrationVerifierExecutableEnv(source);
    const databases = await loadDisposableVerificationDatabaseProvider(env.databaseProviderModule);
    const sandbox = createProcessVerificationSandbox({
        identity: env.runnerIdentity,
        executable: env.sandboxExecutable,
        arguments: env.sandboxArguments,
        tempRoot: env.sandboxTempRoot,
        timeoutMs: env.sandboxTimeoutMs,
        terminationGraceMs: env.sandboxTerminationGraceMs,
        maxInputBytes: env.maxResponseBytes,
        maxOutputBytes: env.sandboxMaxOutputBytes,
        maxErrorBytes: env.sandboxMaxErrorBytes,
        environment: {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            LANG: "C.UTF-8",
            LC_ALL: "C.UTF-8",
            TZ: "UTC",
        },
    });
    const supervisor = await createProductionIntegrationVerifier({ env: source, sandbox, databases });
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    try {
        await runVerificationPullLoop({
            supervisor,
            signal: controller.signal,
            pollIntervalMs: env.pollIntervalMs,
            errorBackoffMs: env.errorBackoffMs,
            onDiagnostic(diagnostic) {
                console.error(JSON.stringify({ event: "integration-verifier-operation-failed", ...diagnostic }));
            },
        });
    } finally {
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
    }
}

if (import.meta.main) {
    try {
        await runIntegrationVerifierExecutable();
    } catch {
        console.error(JSON.stringify({ event: "integration-verifier-failed-to-start" }));
        process.exitCode = 1;
    }
}
