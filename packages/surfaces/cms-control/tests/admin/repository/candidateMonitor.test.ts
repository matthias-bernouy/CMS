import { afterEach, describe, expect, test } from "bun:test";
import { RepositoryApiError } from "../../../src/components/admin/Resources/Repository/api";
import {
    monitorRepositoryCandidate,
    rememberedRepositoryCandidate,
} from "../../../src/components/admin/Resources/Repository/component/candidateMonitor";
import type { RepositoryCandidateView } from "../../../src/components/admin/Resources/Repository/contracts/candidates";
import type { RepositoryCandidateReportView } from "../../../src/components/admin/Resources/Repository/contracts/candidateReport";

const STORAGE_KEY = "cms.repository.candidate-monitor.v1";

describe("repository candidate monitoring", () => {
    afterEach(() => {
        localStorage.clear();
    });

    test("persists progress across refresh and clears it after publication", async () => {
        const queued = candidate("queued");
        const observed: string[] = [];
        const storedDuringWait: Array<string | null> = [];
        const result = await monitorRepositoryCandidate(queued, {
            signal: new AbortController().signal,
            fetchStatus: async () => candidate("published"),
            fetchReport: unexpectedReport,
            onCandidate: (current) => observed.push(current.status),
            onReport: unexpectedReport,
            onRetry: () => {
                throw new Error("unexpected retry");
            },
            wait: async () => {
                storedDuringWait.push(rememberedRepositoryCandidate());
            },
        });

        expect(result.status).toBe("published");
        expect(observed).toEqual(["queued", "published"]);
        expect(storedDuringWait).toEqual([queued.candidateId]);
        expect(rememberedRepositoryCandidate()).toBeNull();
    });

    test("retries bounded repository outages without losing the candidate", async () => {
        let fetches = 0;
        const waits: number[] = [];
        const retries: number[] = [];
        const result = await monitorRepositoryCandidate(candidate("running"), {
            signal: new AbortController().signal,
            fetchStatus: async () => {
                fetches += 1;
                if (fetches === 1) {
                    throw new RepositoryApiError(503, "repository_unavailable", undefined, {});
                }
                return candidate("published");
            },
            fetchReport: unexpectedReport,
            onCandidate: () => undefined,
            onReport: unexpectedReport,
            onRetry: (_current, retryInMs) => retries.push(retryInMs),
            wait: async (delayMs) => {
                waits.push(delayMs);
            },
        });

        expect(result.status).toBe("published");
        expect(fetches).toBe(2);
        expect(retries).toEqual([2_000]);
        expect(waits).toEqual([1_000, 2_000]);
    });

    test("honors a bounded Retry-After delay", async () => {
        let fetches = 0;
        const waits: number[] = [];
        await monitorRepositoryCandidate(candidate("running"), {
            signal: new AbortController().signal,
            fetchStatus: async () => {
                fetches += 1;
                if (fetches === 1) {
                    throw new RepositoryApiError(429, "rate_limited", "7", {});
                }
                return candidate("published");
            },
            fetchReport: unexpectedReport,
            onCandidate: () => undefined,
            onReport: unexpectedReport,
            onRetry: () => undefined,
            wait: async (delayMs) => {
                waits.push(delayMs);
            },
        });

        expect(waits).toEqual([1_000, 7_000]);
    });

    test("rejects corrupt persisted identifiers and clears hard polling failures", async () => {
        localStorage.setItem(STORAGE_KEY, "../candidate");
        expect(rememberedRepositoryCandidate()).toBeNull();

        await expect(
            monitorRepositoryCandidate(candidate("queued"), {
                signal: new AbortController().signal,
                fetchStatus: async () => {
                    throw new RepositoryApiError(404, "candidate_not_found", undefined, {});
                },
                fetchReport: unexpectedReport,
                onCandidate: () => undefined,
                onReport: unexpectedReport,
                onRetry: () => undefined,
                wait: async () => undefined,
            }),
        ).rejects.toBeInstanceOf(RepositoryApiError);
        expect(rememberedRepositoryCandidate()).toBeNull();
    });

    test("fetches one private report after rejected and expired terminals only", async () => {
        for (const status of ["rejected", "expired"] as const) {
            const fetched: string[] = [];
            const reports: RepositoryCandidateReportView[] = [];
            const terminal = candidate(status);
            await monitorRepositoryCandidate(terminal, {
                signal: new AbortController().signal,
                fetchStatus: async () => {
                    throw new Error("terminal candidate must not be polled");
                },
                fetchReport: async (candidateId) => {
                    fetched.push(candidateId);
                    return report(terminal);
                },
                onCandidate: () => undefined,
                onReport: (value) => reports.push(value),
                onRetry: () => undefined,
            });

            expect(fetched).toEqual([terminal.candidateId]);
            expect(reports).toHaveLength(1);
        }
    });
});

function candidate(status: RepositoryCandidateView["status"]): RepositoryCandidateView {
    return {
        candidateId: "candidate-1",
        candidateDigest: `sha256:${"a".repeat(64)}`,
        packageDigest: `sha256:${"b".repeat(64)}`,
        verificationDigest: `sha256:${"c".repeat(64)}`,
        kind: "commerce",
        version: "1.1.0",
        status,
        revision: status === "published" ? 2 : 1,
        createdAt: "2026-07-26T12:00:00.000Z",
        updatedAt: "2026-07-26T12:00:01.000Z",
        expiresAt: "2026-07-27T12:00:00.000Z",
        attemptCount: 1,
    };
}

function report(value: RepositoryCandidateView): RepositoryCandidateReportView {
    return { candidate: value, migrations: [] };
}

async function unexpectedReport(): Promise<never> {
    throw new Error("candidate report was not expected");
}
