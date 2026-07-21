import { BunRunner } from "http-runner/default-implementation/BunRunner";

export interface TestServer {
    /** Base URL of the started server, e.g. `http://localhost:54321`. */
    url: string;
    /** Issue a real HTTP request to the started runner (loopback). */
    request(method: string, path: string, init?: RequestInit): Promise<Response>;
    /** Stop the server and free the port. */
    stop(): void;
}

/**
 * Start a `BunRunner` on an OS-assigned ephemeral port and return a small
 * `.request()` helper. This is the ONE test entry point shared across
 * packages — it replaces the per-package fake `Runner`s, so tests exercise
 * the REAL routing/middleware of `BunRunner` instead of a hand-rolled mock
 * that could drift from it.
 *
 * Mount your routes on the runner first, then pass it here:
 *   const r = new BunRunner(); mountX(r);
 *   const srv = serveForTest(r);
 *   const res = await srv.request("GET", "/health");
 *   srv.stop();
 */
export function serveForTest(runner: BunRunner): TestServer {
    runner.start(0);
    const port = runner.port;
    if (port === undefined) {
        throw new Error("serveForTest: runner did not bind a port");
    }
    const url = `http://localhost:${port}`;
    return {
        url,
        request: (method, path, init = {}) =>
            fetch(`${url}${path.startsWith("/") ? "" : "/"}${path}`, { method, ...init }),
        stop: () => runner.stop(),
    };
}
