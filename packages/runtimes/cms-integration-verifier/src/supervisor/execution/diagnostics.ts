import type { CandidateAdmissionJobResultV1, VerificationJobResultV1 } from "@bernouy/cms-integration-verification";
import type { DisposableVerificationDatabaseCredential } from "../types";

const MAX_DIAGNOSTIC_BYTES = 4_096;
const MAX_TOTAL_DIAGNOSTIC_BYTES = 32_768;
const REDACTED = "[REDACTED]";
const utf8 = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function sanitizeSandboxResult(
    value: CandidateAdmissionJobResultV1 | VerificationJobResultV1,
    credential: DisposableVerificationDatabaseCredential,
): CandidateAdmissionJobResultV1 {
    const candidate =
        value.schema === "cms.integration.candidate-admission-job-result.v1"
            ? value
            : {
                  schema: "cms.integration.candidate-admission-job-result.v1" as const,
                  verification: value,
                  migrations: [],
              };
    const secrets = credentialSecrets(credential);
    let remainingBytes = MAX_TOTAL_DIAGNOSTIC_BYTES;
    const results = Array.isArray(candidate.verification.results)
        ? candidate.verification.results.map((result) => ({
              ...result,
              diagnostics: Array.isArray(result.diagnostics)
                  ? result.diagnostics
                        .slice(0, 8)
                        .flatMap((diagnostic: VerificationJobResultV1["results"][number]["diagnostics"][number]) => {
                            if (remainingBytes < 1 || typeof diagnostic?.message !== "string") {
                                return [];
                            }
                            const redacted = redact(diagnostic.message, secrets);
                            const message = truncateUtf8(redacted, Math.min(MAX_DIAGNOSTIC_BYTES, remainingBytes));
                            if (!message) {
                                return [];
                            }
                            remainingBytes -= utf8.encode(message).byteLength;
                            return [{ code: diagnostic.code, message, redacted: true as const }];
                        })
                  : result.diagnostics,
          }))
        : candidate.verification.results;
    const sanitized = {
        ...candidate,
        verification: { ...candidate.verification, results },
    } as CandidateAdmissionJobResultV1;
    if (containsSecret(sanitized, secrets, new WeakSet())) {
        throw new TypeError("Sandbox result contains disposable database credentials outside diagnostics");
    }
    return sanitized;
}

function containsSecret(value: unknown, secrets: readonly string[], visited: WeakSet<object>): boolean {
    if (typeof value === "string") {
        return secrets.some((secret) => value.includes(secret));
    }
    if (!value || typeof value !== "object") {
        return false;
    }
    if (visited.has(value)) {
        return false;
    }
    visited.add(value);
    return Object.values(value).some((entry) => containsSecret(entry, secrets, visited));
}

function credentialSecrets(credential: DisposableVerificationDatabaseCredential): readonly string[] {
    const values = new Set<string>([credential.connectionUri]);
    try {
        const url = new URL(credential.connectionUri);
        if (url.password) {
            values.add(url.password);
            values.add(decodeURIComponent(url.password));
        }
        for (const value of url.searchParams.values()) {
            values.add(value);
        }
    } catch {
        return [...values].filter((entry) => entry.length >= 4).toSorted(longestFirst);
    }
    return [...values].filter((entry) => entry.length >= 4).toSorted(longestFirst);
}

function redact(message: string, secrets: readonly string[]): string {
    return secrets.reduce((result, secret) => result.replaceAll(secret, REDACTED), message);
}

function truncateUtf8(value: string, limit: number): string {
    const bytes = utf8.encode(value);
    if (bytes.byteLength <= limit) {
        return value;
    }
    let end = limit;
    while (end > 0) {
        try {
            return decoder.decode(bytes.subarray(0, end));
        } catch {
            end -= 1;
        }
    }
    return "";
}

function longestFirst(left: string, right: string): number {
    return right.length - left.length || (left < right ? -1 : left > right ? 1 : 0);
}
