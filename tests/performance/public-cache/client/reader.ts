import { Agent, request } from "node:http";
import { createHash, randomUUID } from "node:crypto";

export type Reading = {
    requestId: string;
    path: string;
    status: number | null;
    cache: string | null;
    cacheControl: string | null;
    etag: string | null;
    contentType: string | null;
    headersMs: number | null;
    firstByteMs: number | null;
    totalMs: number;
    bytes: number;
    hash: string | null;
    reusedSocket: boolean;
    failure: string | null;
};
const MAX_BYTES = 512 * 1024;

/** Fixed loopback transport, canonical Host, no redirects, bounded body and absolute deadline. */
export function publicReader(origin: string, endpoint = origin) {
    const canonical = new URL(origin);
    const target = new URL(endpoint);
    for (const url of [canonical, target]) {
        if (
            url.protocol !== "http:" ||
            !/^(?:127\.0\.0\.1|localhost|[a-z0-9-]+\.localhost)$/u.test(url.hostname) ||
            url.username ||
            url.password
        ) {
            throw new Error("Public-cache measurements require a credential-free loopback origin");
        }
    }
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const bodies: Record<string, string> = {};
    let retainedBytes = 0;
    return {
        bodies,
        close: () => agent.destroy(),
        read(path: string, extraHeaders: Record<string, string> = {}): Promise<Reading> {
            const url = new URL(path, canonical);
            if (url.origin !== canonical.origin) {
                throw new Error("Public-cache resources must remain on the fixture origin");
            }
            const started = performance.now();
            const row: Reading = {
                requestId: randomUUID(),
                path: url.pathname + url.search,
                status: null,
                cache: null,
                cacheControl: null,
                etag: null,
                contentType: null,
                headersMs: null,
                firstByteMs: null,
                totalMs: 0,
                bytes: 0,
                hash: null,
                reusedSocket: false,
                failure: null,
            };
            return new Promise((resolve) => {
                let settled = false;
                const finish = (failure: string | null = null) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(deadline);
                    row.totalMs = performance.now() - started;
                    row.failure = failure;
                    resolve(row);
                };
                const call = request(
                    {
                        hostname: "127.0.0.1",
                        port: target.port || 80,
                        path: url.pathname + url.search,
                        agent,
                        headers: {
                            ...extraHeaders,
                            host: canonical.host,
                            accept: "text/html",
                            "accept-language": "en",
                            "accept-encoding": "identity",
                            "x-request-id": row.requestId,
                        },
                    },
                    (response) => {
                        row.headersMs = performance.now() - started;
                        row.status = response.statusCode ?? null;
                        for (const [field, name] of [
                            ["cache", "x-cache"],
                            ["cacheControl", "cache-control"],
                            ["etag", "etag"],
                            ["contentType", "content-type"],
                        ] as const) {
                            row[field] = String(response.headers[name] ?? "") || null;
                        }
                        const chunks: Buffer[] = [];
                        response.on("data", (chunk: Buffer) => {
                            row.firstByteMs ??= performance.now() - started;
                            row.bytes += chunk.length;
                            if (row.bytes > MAX_BYTES) {
                                finish("response-too-large");
                                response.destroy();
                                call.destroy();
                            } else {
                                chunks.push(Buffer.from(chunk));
                            }
                        });
                        response.once("error", () => finish("response-error"));
                        response.once("aborted", () => finish("response-aborted"));
                        response.once("end", () => {
                            if (settled) {
                                return;
                            }
                            const bytes = Buffer.concat(chunks);
                            row.hash = createHash("sha256").update(bytes).digest("hex");
                            if (!bodies[row.hash]) {
                                if (retainedBytes + bytes.length > 8 * 1024 * 1024) {
                                    finish("body-evidence-budget-exceeded");
                                    return;
                                }
                                retainedBytes += bytes.length;
                                bodies[row.hash] = bytes.toString("utf8");
                            }
                            finish();
                        });
                    },
                );
                const deadline = setTimeout(() => {
                    finish("request-timeout");
                    call.destroy();
                }, 30_000);
                call.once("error", () => finish("request-error"));
                call.once("socket", () => {
                    row.reusedSocket = Boolean(call.reusedSocket);
                });
                call.end();
            });
        },
    };
}
