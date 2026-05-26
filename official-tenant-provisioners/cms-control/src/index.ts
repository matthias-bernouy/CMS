import type { Db } from "mongodb";
import { createProvider, type LogStore, type Provider } from "@bernouy/tenant-provisioner-sdk";
import { MongoCmsRepository } from "@bernouy/cms/repository";
import { makeCmsHooks } from "./hooks";
import { makeCmsDomain } from "./domain";
import { CMS_TENANT_CONFIG } from "./tenantConfig";
import { MongoTenantConfigStore } from "./MongoTenantConfigStore";
import { DEFAULT_CMS_PROVIDER_ID, defaultCollectionPrefix } from "./constants";

export interface CreateCmsProviderOptions {
    /** Mongo Db holding every tenant's collection set (isolated by prefix). */
    db: Db;
    /** Issuer URL the hub mints control-plane tokens under (allowlisted). */
    hubIssuer: string;
    /** Defaults to `"cms-control"`. */
    providerId?: string;
    /** Maps a `tenantId` to its collection prefix. Default `tenant_<id>__`. */
    collectionPrefix?: (tenantId: string) => string;
    /** Inject a custom log store; otherwise a daily-rotated FileLogStore. */
    logStore?: LogStore;
    logDir?:   string;
}

/**
 * The CMS control surface as a conforming tenant-provisioner: importable by the
 * hub, with per-tenant provisioning (a collection set + `system` record) and a
 * config the hub sets. Everything in base.md (auth, planes, provisioning,
 * logs, RFC 7807, OpenAPI, §11 config) comes from the SDK; this wires the CMS
 * domain hooks + the config schema/store.
 */
export function createCmsProvider(opts: CreateCmsProviderOptions): Provider {
    const collectionPrefix = opts.collectionPrefix ?? defaultCollectionPrefix;
    const repoFor = (tenantId: string): MongoCmsRepository =>
        new MongoCmsRepository(opts.db, { collectionPrefix: collectionPrefix(tenantId) });

    return createProvider({
        config: {
            providerId: opts.providerId ?? DEFAULT_CMS_PROVIDER_ID,
            allowlist:  [{ iss: opts.hubIssuer, role: "control-plane" }],
        },
        hooks: makeCmsHooks({
            repoFor,
            initTenant: (id) => repoFor(id).init(),     // create indexes (idempotent)
            dropTenant: async (id) => {
                const escaped = collectionPrefix(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const cols = await opts.db.listCollections({ name: { $regex: `^${escaped}` } }).toArray();
                await Promise.all(cols.map((c) => opts.db.dropCollection(c.name).catch(() => {})));
            },
        }),
        domain:       makeCmsDomain(),
        tenantConfig: { ...CMS_TENANT_CONFIG, store: new MongoTenantConfigStore(opts.db) },
        ...(opts.logStore ? { store: opts.logStore } : opts.logDir ? { logDir: opts.logDir } : {}),
    });
}

export { CMS_TENANT_CONFIG } from "./tenantConfig";
export type { CmsTenantConfig } from "./tenantConfig";
export { MongoTenantConfigStore } from "./MongoTenantConfigStore";
export { makeCmsHooks } from "./hooks";
export type { CmsHooksOptions } from "./hooks";
export { DEFAULT_CMS_PROVIDER_ID, defaultCollectionPrefix } from "./constants";
