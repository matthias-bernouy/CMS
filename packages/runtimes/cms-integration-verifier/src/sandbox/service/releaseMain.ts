import { resolve } from "node:path";
import { readIntegrationVerifierKey, readVerificationSandboxServiceEnv } from "../../config";
import { createProcessVerificationSandbox } from "../process";
import { createSandboxCapabilityVerifier } from "./capability";
import { startVerificationSandboxService } from "./server";

export async function runReleaseRuntimeSandboxService(
    source: Record<string, string | undefined> = process.env,
): Promise<Bun.Server<unknown>> {
    const env = readVerificationSandboxServiceEnv(source);
    const publicKey = await readIntegrationVerifierKey(env.verificationKeyFile, "release runtime verification-key");
    const dockerHost = source.DOCKER_HOST;
    if (!dockerHost || !/^tcp:\/\/127\.0\.0\.1:[0-9]+$/u.test(dockerHost)) {
        throw new Error("Release runtime requires a loopback-only private Docker daemon");
    }
    const sandbox = createProcessVerificationSandbox({
        identity: env.runnerIdentity,
        executable: process.execPath,
        arguments: ["run", resolve(import.meta.dir, "../release/main.ts")],
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
            DOCKER_HOST: dockerHost,
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
        await runReleaseRuntimeSandboxService();
    } catch {
        console.error(JSON.stringify({ event: "integration-release-runtime-failed-to-start" }));
        process.exitCode = 1;
    }
}
