import { readIntegrationVerifierKey, readIntegrationVerifierRemoteSandboxEnv } from "../config";
import { createHttpVerificationSandbox, createSandboxCapabilitySigner } from "../sandbox";
import { createCompositeVerificationSandbox, type VerificationSandbox } from "../supervisor";
import { startVerifierHealthServer, VerificationRuntimeHealth } from "./health";
import { createProductionIntegrationVerifier } from "./production";
import { createDisposableVerificationDatabaseProviderFromEnv } from "./providers/postgres";
import { runVerificationPullLoop } from "./pullLoop";

export async function runIntegrationVerifierExecutable(
    source: Record<string, string | undefined> = process.env,
): Promise<void> {
    if (!source.CMS_INTEGRATION_VERIFIER_SANDBOX_URL || !source.CMS_INTEGRATION_VERIFIER_RELEASE_RUNTIME_URL) {
        throw new Error("Integration verification requires the isolated platform and release runtime services");
    }
    const env = readIntegrationVerifierRemoteSandboxEnv(source);
    const databases = await createDisposableVerificationDatabaseProviderFromEnv(source);
    const sandbox = createCompositeVerificationSandbox({
        platform: await remoteSandbox(env.sandboxOrigin, env.sandboxSigningKeyFile, env.sandboxTimeoutMs, env),
        releaseRuntime: await remoteSandbox(
            env.releaseRuntimeOrigin,
            env.releaseRuntimeSigningKeyFile,
            env.releaseRuntimeTimeoutMs,
            env,
        ),
    });
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
    origin: string,
    signingKeyFile: string,
    timeoutMs: number,
    env: ReturnType<typeof readIntegrationVerifierRemoteSandboxEnv>,
): Promise<VerificationSandbox> {
    const privateKey = await readIntegrationVerifierKey(signingKeyFile, "sandbox signing-key");
    return createHttpVerificationSandbox({
        identity: env.runnerIdentity,
        origin,
        signer: createSandboxCapabilitySigner(privateKey, env.sandboxCapabilityLifetimeMs),
        timeoutMs,
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
