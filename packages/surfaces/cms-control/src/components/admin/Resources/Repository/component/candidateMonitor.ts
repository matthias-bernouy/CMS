import { RepositoryApiError } from "../api";
import type { RepositoryCandidateView } from "../contracts/candidates";

const STORAGE_KEY = "cms.repository.candidate-monitor.v1";
const CANDIDATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const DEFAULT_POLL_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export type RepositoryCandidateMonitorConfig = Readonly<{
    signal: AbortSignal;
    fetchStatus: (candidateId: string, signal: AbortSignal) => Promise<RepositoryCandidateView>;
    onCandidate: (candidate: RepositoryCandidateView) => void;
    onRetry: (candidate: RepositoryCandidateView, retryInMs: number) => void;
    wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}>;

export async function monitorRepositoryCandidate(
    initial: RepositoryCandidateView,
    config: RepositoryCandidateMonitorConfig,
): Promise<RepositoryCandidateView> {
    let candidate = initial;
    let retryCount = 0;
    let waitDelayMs = DEFAULT_POLL_DELAY_MS;
    rememberRepositoryCandidate(candidate.candidateId);
    config.onCandidate(candidate);
    while (!terminalRepositoryCandidateStatus(candidate.status)) {
        await (config.wait ?? waitForCandidatePoll)(waitDelayMs, config.signal);
        try {
            candidate = await config.fetchStatus(candidate.candidateId, config.signal);
            retryCount = 0;
            waitDelayMs = DEFAULT_POLL_DELAY_MS;
            config.onCandidate(candidate);
        } catch (error) {
            if (!retryableCandidatePoll(error)) {
                forgetRepositoryCandidate(candidate.candidateId);
                throw error;
            }
            retryCount += 1;
            waitDelayMs = retryAfterDelay(error) ?? retryDelay(retryCount);
            config.onRetry(candidate, waitDelayMs);
        }
    }
    forgetRepositoryCandidate(candidate.candidateId);
    return candidate;
}

export function rememberedRepositoryCandidate(): string | null {
    try {
        const candidateId = localStorage.getItem(STORAGE_KEY);
        return candidateId && CANDIDATE_ID.test(candidateId) ? candidateId : null;
    } catch {
        return null;
    }
}

export function forgetRepositoryCandidate(candidateId?: string): void {
    try {
        if (!candidateId || localStorage.getItem(STORAGE_KEY) === candidateId) {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Storage is an optional resilience aid; monitoring stays functional without it.
    }
}

export function terminalRepositoryCandidateStatus(status: string): boolean {
    return status === "published" || status === "rejected" || status === "expired";
}

function rememberRepositoryCandidate(candidateId: string): void {
    if (!CANDIDATE_ID.test(candidateId)) {
        throw new TypeError("Repository candidate identifier is invalid");
    }
    try {
        localStorage.setItem(STORAGE_KEY, candidateId);
    } catch {
        // Private browsing and storage policies must not prevent live monitoring.
    }
}

function retryableCandidatePoll(error: unknown): error is RepositoryApiError {
    return error instanceof RepositoryApiError && (error.status === 429 || error.status === 503);
}

function retryAfterDelay(error: RepositoryApiError): number | undefined {
    if (!error.retryAfter || !/^\d+$/u.test(error.retryAfter)) {
        return undefined;
    }
    return Math.min(Number(error.retryAfter) * 1_000, MAX_RETRY_DELAY_MS);
}

function retryDelay(attempt: number): number {
    return Math.min(DEFAULT_POLL_DELAY_MS * 2 ** Math.min(attempt, 5), MAX_RETRY_DELAY_MS);
}

async function waitForCandidatePoll(delayMs: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const abort = () => {
            clearTimeout(timeout);
            reject(new DOMException("Candidate monitoring aborted", "AbortError"));
        };
        const timeout = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, delayMs);
        signal.addEventListener("abort", abort, { once: true });
    });
}
