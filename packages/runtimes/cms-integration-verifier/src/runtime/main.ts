import {
    readIntegrationVerifierExecutableEnv,
    readIntegrationVerifierKey,
    readIntegrationVerifierRemoteSandboxEnv,
} from "../config";
import {
    createHttpVerificationSandbox,
    createProcessVerificationSandbox,
    createSandboxCapabilitySigner,
} from "../sandbox";
import type { VerificationSandbox } from "../supervisor";
import { startVerifierHealthServer, VerificationRuntimeHealth } from "./health";
import { loadDisposableVerificationDatabaseProvider } from "./provider";
import { createProductionIntegrationVerifier } from "./production";
import { runVerificationPullLoop } from "./pullLoop";

export async function runIntegrationVerifierExecutable(
    source: Record<string, string | undefined> = process.env,
): Promise<void> {
    if (source.NODE_ENV === "production" && !source.CMS_INTEGRATION_VERIFIER_SANDBOX_URL) {
        throw new Error("Production verification requires the isolated remote sandbox service");
    }
    const remoteEnv = source.CMS_INTEGRATION_VERIFIER_SANDBOX_URL
        ? readIntegrationVerifierRemoteSandboxEnv(source)
        : undefined;
    const localEnv = remoteEnv ? undefined : readIntegrationVerifierExecutableEnv(source);
    const env = remoteEnv ?? localEnv!;
    const databases = await loadDisposableVerificationDatabaseProvider(env.databaseProviderModule);
    const sandbox = remoteEnv ? await remoteSandbox(remoteEnv) : localSandbox(localEnv!);
    const supervisor = await createProductionIntegrationVerifier({ env: source, sandbox, databases });
    const healthState = new VerificationRuntimeHealth();
    const health = remoteEnv ? startVerifierHealthServer(remoteEnv.healthPort, healthState) : undefined;
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

function localSandbox(env: ReturnType<typeof readIntegrationVerifierExecutableEnv>): VerificationSandbox {
    return createProcessVerificationSandbox({
        identity: env.runnerIdentity,
        executable: env.sandboxExecutable,
        arguments: env.sandboxArguments,
        tempRoot: env.sandboxTempRoot,
        timeoutMs: env.sandboxTimeoutMs,
        terminationGraceMs: env.sandboxTerminationGraceMs,
        maxInputBytes: env.maxResponseBytes,
        maxOutputBytes: env.sandboxMaxOutputBytes,
        maxErrorBytes: env.sandboxMaxErrorBytes,
        environment: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC" },
    });
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
