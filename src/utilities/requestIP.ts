/**
 * Per-request TCP-level remote-address tracking.
 *
 * The standard `Request` object does not carry the IP of the TCP peer that
 * sent it — that information is only available on the underlying server
 * object (e.g. `Bun.serve`'s `server.requestIP(request)`). To make the IP
 * reachable from any layer that holds the `Request` (handlers, nested
 * runners, dispatchers), the active Runner records it here at ingress and
 * consumers read it back via `getRequestIP(req)`.
 *
 * Storage is a module-level `WeakMap<Request, string>`. Entries are
 * collected automatically when the Request is no longer referenced, so no
 * manual cleanup is required.
 *
 * IMPORTANT: this is the *direct* TCP peer. Behind a reverse proxy this is
 * the proxy's IP, not the originating client. The `X-Forwarded-For` header
 * carries the original client IP — but is spoofable when requests can
 * bypass the proxy, so it must only be trusted in deployments where every
 * incoming request is guaranteed to transit a proxy under the operator's
 * control.
 */
const _requestIPs = new WeakMap<Request, string>();

/**
 * Records the TCP-level remote address for an incoming Request. Called by
 * Runner implementations at request ingress; not part of the public
 * package barrel.
 */
export function setRequestIP(req: Request, ip: string): void {
    _requestIPs.set(req, ip);
}

/**
 * Returns the TCP-level remote address recorded by the active Runner for
 * this Request, or `undefined` when no Runner recorded one (e.g. tests
 * synthesising Requests directly, or Runner implementations that do not
 * yet support IP capture).
 */
export function getRequestIP(req: Request): string | undefined {
    return _requestIPs.get(req);
}
