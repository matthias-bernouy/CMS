/**
 * @bernouy/http-runner — the HTTP mounting seam.
 *
 * Root export = the `Runner` contract every surface mounts onto, the
 * default Bun implementation, and the runner-adjacent helpers (static
 * folder registration, request-IP stamping). Test harness lives under
 * `@bernouy/http-runner/testing`.
 */

export type { Runner, RouteHandler, Middleware } from "http-runner/interfaces/Runner";
export { BunRunner }                             from "http-runner/default-implementation/BunRunner";
export { registerStaticFolder }                  from "http-runner/core/registerStaticFolder";
export { getRequestIP, setRequestIP }            from "http-runner/core/requestIP";
export { escapeHtml, htmlResponse, redirect }    from "http-runner/core/html";
