import { BucketsClient } from "@bernouy/cdn-buckets";
import { MtControlClient } from "@bernouy/mt-cms-control";
import { KeycloakAdminClient } from "@bernouy/keycloak-client";
import type { HubConfig } from "src/interfaces/HubConfig";
import type { ProvisionTenantInput, ProvisionTenantResult } from "src/core/schemas/provisionTenant";
import { HubError } from "src/core/HubError";
import { provisionTenant }   from "src/core/provisionTenant";
import { deprovisionTenant } from "src/core/deprovisionTenant";
import { checkInit }         from "src/core/checkInit";

/**
 * Composition root for the orchestration. Holds a `KeycloakAdminClient`
 * (manages its own JWT cache) and creates short-lived `BucketsClient` /
 * `MtControlClient` instances per operation, sharing the cached JWT.
 *
 * Public surface: `init()`, `provisionTenant()`, `deprovisionTenant()`.
 * The recipe lives in `core/` — this class is glue.
 */
export class Hub {

    private readonly _config: HubConfig;
    private readonly _kc:     KeycloakAdminClient;

    constructor(config: HubConfig) {
        this._config = config;
        this._kc = new KeycloakAdminClient({
            baseUrl: config.keycloak.baseUrl,
            auth: {
                type:         "client-credentials",
                realm:        config.keycloak.adminRealm,
                clientId:     config.keycloak.adminClientId,
                clientSecret: config.keycloak.adminClientSecret,
            },
            ...(config.fetch ? { fetch: config.fetch } : {}),
        });
    }

    /** Underlying Keycloak admin client — exposed for advanced ops outside the recipe. */
    get keycloak(): KeycloakAdminClient { return this._kc; }

    async init(): Promise<void> {
        await checkInit({
            keycloak:     this._kc,
            getCmsClient: () => this._cmsClient(),
            getCdnClient: () => this._cdnClient(),
            config:       this._config,
        });
    }

    async provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
        const cms = await this._cmsClient();
        const cdn = await this._cdnClient();
        try {
            return await provisionTenant({ keycloak: this._kc, cms, cdn, config: this._config, input });
        } catch (err) {
            // Best-effort rollback. Errors from the rollback are swallowed so the
            // ORIGINAL error surfaces to the caller.
            await deprovisionTenant({ keycloak: this._kc, cms, cdn, slug: input.slug }).catch(() => null);
            if (err instanceof HubError) throw err;
            const message = err instanceof Error ? err.message : String(err);
            throw new HubError("provision_failed", `Provisioning of "${input.slug}" failed and was rolled back: ${message}`, err);
        }
    }

    async deprovisionTenant(slug: string): Promise<void> {
        const cms = await this._cmsClient();
        const cdn = await this._cdnClient();
        await deprovisionTenant({ keycloak: this._kc, cms, cdn, slug });
    }

    // ── private — instantiate downstream clients with a fresh JWT each op ──

    private async _cmsClient(): Promise<MtControlClient> {
        const token = await this._kc.getAccessToken();
        return new MtControlClient({
            baseUrl: this._config.cms.baseUrl,
            token,
            ...(this._config.fetch ? { fetch: this._config.fetch } : {}),
        });
    }

    private async _cdnClient(): Promise<BucketsClient> {
        const token = await this._kc.getAccessToken();
        return new BucketsClient({
            baseUrl: this._config.cdn.baseUrl,
            token,
            ...(this._config.fetch ? { fetch: this._config.fetch } : {}),
        });
    }
}
