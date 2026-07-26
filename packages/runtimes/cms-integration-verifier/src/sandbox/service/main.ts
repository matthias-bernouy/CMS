import { readIntegrationVerifierKey, readVerificationSandboxServiceEnv } from "../../config";
import { createProcessVerificationSandbox } from "../process";
import { createSandboxCapabilityVerifier } from "./capability";
import { startVerificationSandboxService } from "./server";

export async function runVerificationSandboxService(
    source: Record<string, string | undefined> = process.env,
): Promise<Bun.Server<unknown>> {
    const env = readVerificationSandboxServiceEnv(source);
    const publicKey = await readIntegrationVerifierKey(env.verificationKeyFile, "sandbox verification-key");
    const sandbox = createProcessVerificationSandbox({
        identity: env.runnerIdentity,
        executable: env.executable,
        arguments: env.arguments,
        tempRoot: env.tempRoot,
        timeoutMs: env.timeoutMs,
        terminationGraceMs: env.terminationGraceMs,
        maxInputBytes: env.maxInputBytes,
        maxOutputBytes: env.maxOutputBytes,
        maxErrorBytes: env.maxErrorBytes,
        environment: {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            LANG: "C.UTF-8",
            LC_ALL: "C.UTF-8",
            TZ: "UTC",
        },
    });
    return startVerificationSandboxService({
        port: env.port,
        verifier: createSandboxCapabilityVerifier(publicKey),
        sandbox,
        maxInputBytes: env.maxInputBytes,
        maxOutputBytes: env.maxOutputBytes,
    });
}

if (import.meta.main) {
    try {
        await runVerificationSandboxService();
    } catch {
        console.error(JSON.stringify({ event: "integration-verifier-sandbox-failed-to-start" }));
        process.exitCode = 1;
    }
}
