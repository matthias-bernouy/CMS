import {
    TENANT_PROVISIONER_CONTRACT_VERSION, METADOC_VERSION_FIELD,
} from "@bernouy/tenant-provisioner-contract";
import type { IssuerConfig } from "src/interfaces/IssuerConfig";

/**
 * RFC 8414 metadoc — exactly what `_sdk` `discovery.ts` validates
 * (`issuer === iss` byte-for-byte, `jwks_uri` same-origin, the version
 * under `METADOC_VERSION_FIELD`). Keys + version come from the SHARED
 * contract, so sign and verify cannot disagree by construction.
 * `config` is already validated/same-origin-checked by `parseIssuerConfig`.
 */
export function buildMetadoc(config: IssuerConfig): Record<string, unknown> {
    return {
        issuer:   config.issuer,
        jwks_uri: config.jwksUri,
        signing_alg_values_supported: [...config.algorithms],
        [METADOC_VERSION_FIELD]: TENANT_PROVISIONER_CONTRACT_VERSION,
    };
}
