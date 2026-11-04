import type { IdentityService, IdentityValue } from "cms-gateway/identity/interfaces/Identity";
import type {
    ProviderIdentityScope,
    ProviderIdentityService,
} from "cms-gateway/identity/interfaces/ProviderIdentityService";

/** One string alias per CMS subject and Provider authority. */
export class ProviderIdentityAliases implements ProviderIdentityService {
    constructor(private readonly identities: IdentityService) {}

    async getOrCreate(scope: ProviderIdentityScope, cmsSubjectId: string): Promise<string> {
        const providerId = providerAuthority(scope);
        const existing = await this.identities.resolve(
            { authority: "cms", kind: "user", value: cmsSubjectId },
            providerId,
        );
        if (existing !== null) {
            return outboundAlias(existing);
        }
        const generated = crypto.randomUUID();
        try {
            await this.identities.bind(cmsSubjectId, { authority: providerId, kind: "user", value: generated });
        } catch (error) {
            // A concurrent request may have bound this subject first. Preserve its winning alias.
            const winner = await this.identities.resolve(
                { authority: "cms", kind: "user", value: cmsSubjectId },
                providerId,
            );
            if (winner === null) {
                throw error;
            }
            return outboundAlias(winner);
        }
        return generated;
    }

    async resolve(scope: ProviderIdentityScope, providerSubjectId: string): Promise<string | null> {
        const providerId = providerAuthority(scope);
        const alias = outboundAlias(providerSubjectId);
        const subject = await this.identities.resolve({ authority: providerId, kind: "user", value: alias }, "cms");
        if (subject !== null && typeof subject !== "string") {
            throw new TypeError("CMS identity subject is invalid");
        }
        return subject;
    }
}

function providerAuthority(scope: ProviderIdentityScope): string {
    if (
        !scope ||
        typeof scope.providerId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(scope.providerId) ||
        scope.providerId === "cms"
    ) {
        throw new TypeError("provider ID is invalid");
    }
    return scope.providerId;
}

function outboundAlias(value: IdentityValue): string {
    if (typeof value !== "string" || !/^[\x20-\x7e]{1,256}$/.test(value)) {
        throw new TypeError("provider identity alias must be a transmissible string");
    }
    return value;
}
