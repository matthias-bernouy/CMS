import { join } from "node:path";

import type { Runner, Authentication, Middleware } from "@bernouy/core";
import { serveApi } from "@bernouy/core";
import type { BucketProxyRepository } from "@bernouy/cdn-buckets";

import type { EdgeRepository } from "../interfaces/repositories/EdgeRepository";
import type { AccessMetricsRepository } from "../interfaces/repositories/AccessMetricsRepository";
import { mountOriginAdminSurface } from "../core/admin/mountAdminSurface";
import { regenerateAndReloadLsyncd } from "../core/lsyncd/reload";
import { pullAllEdgeLogs, type LogPullConfig } from "../core/logs/pullEdgeLogs";
import { aggregateAccessLogs } from "../core/logs/aggregateAccessLogs";
import { originPackageRoot } from "../constants";

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
    /** Edge access-log puller. When `null`, the puller loop doesn't run. */
    logs: (LogPullConfig & {
        /** Default 15 min. Smaller = lower latency between rotation on
         *  the edge and visibility on the origin. */
        intervalMs: number;
    }) | null;
};

export type OriginDeps = {
    runner:           Runner;
    authentication:   Authentication;
    edgeRepo:         EdgeRepository;
    accessMetricsRepo: AccessMetricsRepository;
    /** Provided by the cdn-buckets `StorageProvider` instance running
     *  alongside the origin. Read-only here: the origin only reads it to
     *  build the secrets manifest served at `/edge-api/secrets`. */
    bucketProxyRepo:   BucketProxyRepository;
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
 * `@bernouy/cdn-buckets`'s `StorageProvider`, which is mounted in parallel on the
 * same `Runner`. The two surfaces compose because they live under
 * different sub-paths.
 */
export class OriginProvider {

    private _runner:             Runner;
    private _auth:               Authentication;
    private _edgeRepo:           EdgeRepository;
    private _accessMetricsRepo:  AccessMetricsRepository;
    private _bucketProxyRepo:    BucketProxyRepository;
    private _config:             OriginConfig;

    constructor(deps: OriginDeps) {
        this._runner            = deps.runner;
        this._auth              = deps.authentication;
        this._edgeRepo          = deps.edgeRepo;
        this._accessMetricsRepo = deps.accessMetricsRepo;
        this._bucketProxyRepo   = deps.bucketProxyRepo;
        this._config            = deps.config;

        this._runner.group("/admin/origin", (admin) => mountOriginAdminSurface(admin, this), [deps.adminGuard]);
        this._runner.group("/edge-api",     (edge)  => serveApi(edge, join(originPackageRoot, "src/api/edge"), this));
    }

    get runner()            { return this._runner; }
    get auth()              { return this._auth; }
    get edgeRepo()          { return this._edgeRepo; }
    get accessMetricsRepo() { return this._accessMetricsRepo; }
    get bucketProxyRepo()   { return this._bucketProxyRepo; }
    get config()            { return this._config; }

    /**
     * Regenerate the lsyncd config from the current edge list. Use case:
     * container restart — the lsyncd config file lives at
     * `/etc/lsyncd/lsyncd.conf.lua` (inside the image, not the volume),
     * so a fresh container boots with no config and the supervisor sleeps
     * until something writes one. Calling this at boot repaints it.
     */
    async regenerateLsyncd(): Promise<void> {
        if (!this._config.lsyncd) return;
        const edges = await this._edgeRepo.list();
        await regenerateAndReloadLsyncd(this._config.lsyncd, edges);
    }

    /**
     * Start an in-process loop that:
     *  1. pulls each edge's rotated access-log archives via SSH+rsync,
     *  2. folds new `.gz` files into the daily aggregates in Mongo.
     * Runs every `config.logs.intervalMs` (default 15 min). Idempotent
     * — rsync skips files already present, and aggregation tracks
     * processed filenames to avoid double-counting. Failures logged
     * but never crash the loop.
     */
    startLogPullerLoop(): void {
        const cfg = this._config.logs;
        if (!cfg) return;
        const tick = async () => {
            try {
                const edges = await this._edgeRepo.list();
                if (edges.length > 0) {
                    const results = await pullAllEdgeLogs(edges, cfg);
                    for (const r of results) {
                        if (!r.ok) {
                            console.warn(`[origin/log-puller] ${r.edgeId}: ${r.error}`);
                        } else if (r.bytesReceived && r.bytesReceived > 0) {
                            console.log(`[origin/log-puller] ${r.edgeId}: pulled ${r.bytesReceived} bytes`);
                        }
                    }
                    await aggregateAccessLogs(edges, cfg.localDir, this._accessMetricsRepo);
                }
            } catch (e) {
                console.error("[origin/log-puller] tick failed:", e);
            }
            setTimeout(tick, cfg.intervalMs);
        };
        // First tick after a short delay so the rest of the boot can finish.
        setTimeout(tick, 30_000);
    }
}
