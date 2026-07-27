import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import type { VerificationQuery } from "@bernouy/cms-integration-verification/sdk/v1";
import { readBoundedChildStream } from "../../streams";
import { observeChildClose, terminateChild } from "../../termination";
import {
    AUTHOR_SUITE_LIMITS,
    canonicalJsonLine,
    readBoundedCanonicalJsonLines,
    type AuthorSuiteChildConfig,
    type AuthorSuiteChildResult,
} from "../protocol";
import { executeAuthorQuery, isAuthorSuiteChildResult, parseAuthorSuiteQueryRequest } from "./query";

type ProcessLimits = Readonly<{
    tempRoot: string;
    timeoutMs: number;
    maxOutputBytes: number;
}>;

export async function executeAuthorSuiteChild(
    config: AuthorSuiteChildConfig,
    query: VerificationQuery,
    signal: AbortSignal,
    limits: ProcessLimits,
): Promise<AuthorSuiteChildResult> {
    const child = launch(limits.tempRoot);
    const closed = observeChildClose(child);
    const stderr = readBoundedChildStream(child.stderr, AUTHOR_SUITE_LIMITS.maxErrorBytes, "error-output-limit");
    const stderrFailure = stderr.then(async () => await new Promise<never>(() => undefined));
    const protocol = superviseProtocol(child, config, query, limits.maxOutputBytes);
    const stop = stopReason(signal, limits.timeoutMs);
    try {
        const winner = await Promise.race([
            protocol.then((result) => ({ kind: "result" as const, result })),
            stop.promise,
            stderrFailure,
        ]);
        if (winner.kind !== "result") {
            await terminateChild(child, AUTHOR_SUITE_LIMITS.terminationGraceMs, closed);
            await protocol.catch(() => undefined);
            throw new AuthorSuiteProcessError(winner.kind);
        }
        child.stdin.end();
        const [status] = await Promise.all([closed, stderr]);
        if (status.code !== 0 || status.signal !== null || status.launchError) {
            throw new AuthorSuiteProcessError("process-failed");
        }
        return winner.result;
    } finally {
        stop.dispose();
        if (child.pid) {
            await terminateChild(child, AUTHOR_SUITE_LIMITS.terminationGraceMs, closed).catch(() => undefined);
        }
    }
}

function launch(tempRoot: string): ChildProcessWithoutNullStreams {
    const childModule = join(import.meta.dir, "../childMain.ts");
    return spawn(process.execPath, ["--no-env-file", "run", childModule], {
        cwd: tempRoot,
        detached: true,
        env: {
            HOME: tempRoot,
            TMPDIR: tempRoot,
            TMP: tempRoot,
            TEMP: tempRoot,
            LANG: "C.UTF-8",
            LC_ALL: "C.UTF-8",
            TZ: "UTC",
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
    });
}

async function superviseProtocol(
    child: ChildProcessWithoutNullStreams,
    config: AuthorSuiteChildConfig,
    query: VerificationQuery,
    maxOutputBytes: number,
): Promise<AuthorSuiteChildResult> {
    const configLine = canonicalJsonLine(config);
    if (configLine.byteLength > AUTHOR_SUITE_LIMITS.maxConfigBytes) {
        throw new AuthorSuiteProcessError("input-limit");
    }
    await writeChild(child, configLine);
    let queryCount = 0;
    let expectedQueryId = 1;
    for await (const value of readBoundedCanonicalJsonLines(child.stdout, {
        maxTotalBytes: maxOutputBytes,
        maxLineBytes: AUTHOR_SUITE_LIMITS.maxLineBytes,
    })) {
        if (isAuthorSuiteChildResult(value)) {
            return value;
        }
        const request = parseAuthorSuiteQueryRequest(value, expectedQueryId++);
        queryCount += 1;
        const response =
            queryCount > AUTHOR_SUITE_LIMITS.maxQueries
                ? { type: "query-result" as const, id: request.id, ok: false as const, code: "query-limit" as const }
                : await executeAuthorQuery(request, query);
        const line = canonicalJsonLine(response);
        if (line.byteLength > AUTHOR_SUITE_LIMITS.maxResponseBytes) {
            await writeChild(
                child,
                canonicalJsonLine({ type: "query-result", id: request.id, ok: false, code: "query-limit" }),
            );
        } else {
            await writeChild(child, line);
        }
    }
    throw new AuthorSuiteProcessError("process-failed");
}

function stopReason(signal: AbortSignal, timeoutMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const promise = new Promise<Readonly<{ kind: "aborted" | "timeout" }>>((resolve) => {
        abort = () => resolve({ kind: "aborted" });
        if (signal.aborted) {
            resolve({ kind: "aborted" });
            return;
        }
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
    });
    return {
        promise,
        dispose() {
            if (timer) {
                clearTimeout(timer);
            }
            if (abort) {
                signal.removeEventListener("abort", abort);
            }
        },
    };
}

async function writeChild(child: ChildProcessWithoutNullStreams, bytes: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        child.stdin.write(Buffer.from(bytes), (error) => (error ? reject(error) : resolve()));
    });
}

export class AuthorSuiteProcessError extends Error {
    override readonly name = "AuthorSuiteProcessError";

    constructor(readonly code: "aborted" | "input-limit" | "output-limit" | "process-failed" | "timeout") {
        super(`Author suite process failed: ${code}`);
    }
}
