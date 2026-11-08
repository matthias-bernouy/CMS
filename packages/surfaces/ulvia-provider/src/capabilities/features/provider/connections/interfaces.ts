import type { ProviderConnectionRegistry } from "@bernouy/cms-gateway/provider";

/** Return-channel storage is supplied by the instance composition root. */
export interface ProviderConnectionServices {
    readonly providerConnections: Pick<ProviderConnectionRegistry, "configure">;
}
