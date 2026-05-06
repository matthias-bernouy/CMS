import type { Runner, Authentication, Middleware } from "@bernouy/core";

import type { EdgeRepository } from "../interfaces/repositories/EdgeRepository";
import { mountOriginAdminSurface } from "../core/admin/mountAdminSurface";

export type OriginConfig = {
    /** lsyncd configuration. When `null`, edge writes only persist in
     *  the DB — useful for local dev / tests. */
    lsyncd: {
        sourcePath: string;
        sshKeyPath: string;
        configPath: string;
        statusPath: string;
        logPath:    string;
        reloadCmd:  string;
    } | null;
    /** Probe configuration (SSH key reused for read-only stat calls). */
    probe: {
        sshKeyPath: string;
    } | null;
};

export type OriginDeps = {
    runner:         Runner;
    authentication: Authentication;
    edgeRepo:       EdgeRepository;
    /** Middleware that gates the admin surface. The cdn-origin
     *  deployment passes its `createAdminGuard(auth)` here so the same
     *  Keycloak session that authorises `/admin/buckets` also authorises
     *  `/admin/origin`. */
    adminGuard:     Middleware;
    config:         OriginConfig;
};

/**
 * Composition root for the origin's admin surface. Mounts:
 *   - `/admin/origin/*`  → static admin pages + API for edge + monitoring
 *
 * Does NOT touch the bucket-serving side of the origin: that is owned by
 * `@bernouy/cdn`'s `StorageProvider`, which is mounted in parallel on the
 * same `Runner`. The two surfaces compose because they live under
 * different sub-paths.
 */
export class OriginProvider {

    private _runner:    Runner;
    private _auth:      Authentication;
    private _edgeRepo:  EdgeRepository;
    private _config:    OriginConfig;

    constructor(deps: OriginDeps) {
        this._runner   = deps.runner;
        this._auth     = deps.authentication;
        this._edgeRepo = deps.edgeRepo;
        this._config   = deps.config;

        this._runner.group("/admin/origin", (admin) => mountOriginAdminSurface(admin, this), [deps.adminGuard]);
    }

    get runner()   { return this._runner; }
    get auth()     { return this._auth; }
    get edgeRepo() { return this._edgeRepo; }
    get config()   { return this._config; }
}
