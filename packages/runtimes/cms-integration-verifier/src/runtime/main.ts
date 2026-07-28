import { readIntegrationVerifierKey, readIntegrationVerifierRemoteSandboxEnv } from "../config";
import { createHttpVerificationSandbox, createSandboxCapabilitySigner } from "../sandbox";
import type { VerificationSandbox } from "../supervisor";
import { startVerifierHealthServer, VerificationRuntimeHealth } from "./health";
import { createProductionIntegrationVerifier } from "./production";
import { createDisposableVerificationDatabaseProviderFromEnv } from "./providers/postgres";
import { runVerificationPullLoop } from "./pullLoop";

export async function runIntegrationVerifierExecutable(
    source: Record<string, string | undefined> = process.env,
): Promise<void> {
    if (!source.CMS_INTEGRATION_VERIFIER_SANDBOX_URL) {
        throw new Error("Integration verification requires the isolated remote sandbox service");
    }
    const env = readIntegrationVerifierRemoteSandboxEnv(source);
    const databases = await createDisposableVerificationDatabaseProviderFromEnv(source);
    const sandbox = await remoteSandbox(env);
    const supervisor = await createProductionIntegrationVerifier({ env: source, sandbox, databases });
    const healthState = new VerificationRuntimeHealth();
    const health = startVerifierHealthServer(env.healthPort, healthState);
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
            onSuccess: () => healthState.success(),
            onDiagnostic(diagnostic) {
                healthState.failure(diagnostic);
                console.error(JSON.stringify({ event: "integration-verifier-operation-failed", ...diagnostic }));
            },
        });
    } finally {
        health?.stop(true);
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
    }
}

async function remoteSandbox(
    env: ReturnType<typeof readIntegrationVerifierRemoteSandboxEnv>,
): Promise<VerificationSandbox> {
    const privateKey = await readIntegrationVerifierKey(env.sandboxSigningKeyFile, "sandbox signing-key");
    return createHttpVerificationSandbox({
        identity: env.runnerIdentity,
        origin: env.sandboxOrigin,
        signer: createSandboxCapabilitySigner(privateKey, env.sandboxCapabilityLifetimeMs),
        timeoutMs: env.sandboxTimeoutMs,
        maxInputBytes: env.sandboxMaxInputBytes,
        maxOutputBytes: env.sandboxMaxOutputBytes,
    });
}

if (import.meta.main) {
    try {
        await runIntegrationVerifierExecutable();
    } catch {
        console.error(JSON.stringify({ event: "integration-verifier-failed-to-start" }));
        process.exitCode = 1;
    }
}
