import type { VerifiedAuth } from "src/core/auth/verifyToken";
import type { TenantState } from "src/interfaces/TenantRegistry";
import { AuthError } from "src/core/errors";

/**
 * Per-request verified auth, stashed by the mount middleware and read by
 * handlers (per-request data can't ride a shared `serveApi` ctx).
 *
 * The WeakMap is pinned on `globalThis` via `Symbol.for` because the handlers
 * that read it are loaded by `serveApi` through a DYNAMIC import, which can
 * yield a different module instance than the statically-imported middleware
 * that writes it (cf. `@bernouy/core` `CredentialAuthentication`). A plain
 * module-level WeakMap would then differ on each side → silent 401s. Pinning
 * keeps the store identity-stable across that boundary.
 */
export interface RequestAuth extends VerifiedAuth {
    tenant: TenantState | null;
}

const STORE_KEY = Symbol.for("@bernouy/tenant-provisioner-sdk::requestAuth");
const store = ((globalThis as Record<symbol, unknown>)[STORE_KEY] ??=
    new WeakMap<Request, RequestAuth>()) as WeakMap<Request, RequestAuth>;

export function setRequestAuth(req: Request, auth: RequestAuth): void {
    store.set(req, auth);
}

export function getRequestAuth(req: Request): RequestAuth {
    const a = store.get(req);
    if (!a) throw new AuthError(); // handler reached without the middleware
    return a;
}
