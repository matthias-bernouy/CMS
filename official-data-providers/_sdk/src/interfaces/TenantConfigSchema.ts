/**
 * What a provider passes to `createProvider({ tenantConfig })`. The SDK
 * serves it at `GET /openapi.tenant-config.json` (control-plane gated).
 * Pure type — no executable import (Socle interfaces/ purity).
 *
 * `schema` is a JSON Schema Draft 2020-12 description of the provider's
 * tenant-level configuration object. See base.md §11 / `.work/_dataprovider_config/02-schema-spec.md`.
 */
export interface TenantConfigSchema {
    /** Provider-controlled version. Major bump = breaking; hub must migrate. */
    version: string;
    /** JSON Schema body (type:"object" with properties / required / …). */
    schema:  Record<string, unknown>;
}
