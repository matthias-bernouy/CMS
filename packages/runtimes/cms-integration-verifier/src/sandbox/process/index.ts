import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    parsePinnedVerificationRunnerIdentity,
    parseCandidateAdmissionJobResult,
    parseVerificationJobResult,
} from "@bernouy/cms-integration-verification";
import type { VerificationSandbox, VerificationSandboxInput } from "../../supervisor";
import { executeSandboxProcess } from "./execution";
import {
    ProcessVerificationSandboxError,
    type ProcessVerificationSandboxConfig,
    type ProcessVerificationSandboxErrorCode,
} from "./types";

export function createProcessVerificationSandbox(config: ProcessVerificationSandboxConfig): VerificationSandbox {
    assertProcessConfig(config);
    return Object.freeze({
        identity: Object.freeze({ ...config.identity }),
        async run(input: VerificationSandboxInput, signal: AbortSignal) {
            const output = await executeSandboxProcess(config, canonicalJsonBytes(input), signal);
            try {
                const result = await parseSandboxOutput(output);
                const canonical = canonicalJsonBytes(result);
                if (
                    !sameBytes(output, canonical) &&
                    !(result.migrations.length === 0 && sameBytes(output, canonicalJsonBytes(result.verification)))
                ) {
                    throw new TypeError("non-canonical result");
                }
                return result;
            } catch {
                throw new ProcessVerificationSandboxError("invalid-output");
            }
        },
    });
}

async function parseSandboxOutput(output: Uint8Array) {
    try {
        return await parseCandidateAdmissionJobResult(output);
    } catch {
        return {
            schema: "cms.integration.candidate-admission-job-result.v1" as const,
            verification: await parseVerificationJobResult(output),
            migrations: [],
        };
    }
}

export { ProcessVerificationSandboxError };
export type { ProcessVerificationSandboxConfig, ProcessVerificationSandboxErrorCode };

function assertProcessConfig(config: ProcessVerificationSandboxConfig): void {
    parsePinnedVerificationRunnerIdentity(config.identity);
    if (!config.executable.startsWith("/") || !config.tempRoot.startsWith("/")) {
        throw new TypeError("Verification sandbox executable and temp root must be absolute");
    }
    if (
        (config.arguments?.length ?? 0) > 32 ||
        config.arguments?.some(
            (argument) => typeof argument !== "string" || argument.length > 4_096 || argument.includes("\0"),
        )
    ) {
        throw new TypeError("Verification sandbox arguments are invalid");
    }
    for (const [name, value] of Object.entries(config.environment ?? {})) {
        if (!/^(?:PATH|LANG|LC_ALL|TZ|DOCKER_HOST)$/u.test(name) || value.includes("\0") || value.length > 4_096) {
            throw new TypeError("Verification sandbox environment contains a forbidden entry");
        }
    }
    for (const value of [
        config.timeoutMs,
        config.terminationGraceMs,
        config.maxInputBytes,
        config.maxOutputBytes,
        config.maxErrorBytes,
    ]) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new TypeError("Verification sandbox limits must be positive integers");
        }
    }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
