import type { PinnedVerificationRunnerIdentity } from "@bernouy/cms-integration-verification";

export type ProcessVerificationSandboxConfig = Readonly<{
    identity: PinnedVerificationRunnerIdentity;
    executable: string;
    arguments?: readonly string[];
    tempRoot: string;
    timeoutMs: number;
    terminationGraceMs: number;
    maxInputBytes: number;
    maxOutputBytes: number;
    maxErrorBytes: number;
    environment?: Readonly<Record<string, string>>;
}>;

export type ProcessVerificationSandboxErrorCode =
    | "input-limit"
    | "output-limit"
    | "error-output-limit"
    | "timeout"
    | "aborted"
    | "launch-failed"
    | "process-failed"
    | "cleanup-failed"
    | "invalid-output";

export class ProcessVerificationSandboxError extends Error {
    override readonly name = "ProcessVerificationSandboxError";

    constructor(readonly code: ProcessVerificationSandboxErrorCode) {
        super(`Verification sandbox failed: ${code}`);
    }
}
