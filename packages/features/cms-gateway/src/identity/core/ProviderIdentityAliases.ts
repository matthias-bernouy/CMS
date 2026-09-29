import type { IdentityService, IdentityValue } from "cms-gateway/identity/interfaces/Identity";
import type {
    ProviderIdentityScope,
    ProviderIdentityService,
} from "cms-gateway/identity/interfaces/ProviderIdentityService";

/** Uses the existing authority-to-subject aliases, including bindings made by legacy Sources. */
export class ProviderIdentityAliases implements ProviderIdentityService {
    constructor(private readonly identities: IdentityService) {}

    async getOrCreate(scope: ProviderIdentityScope, cmsSubjectId: string): Promise<string> {
        const providerId = providerAuthority(scope);
        const existing = await this.identities.resolve(
            { authority: "cms", kind: "user", value: cmsSubjectId },
            providerId,
        );
        if (existing !== null) {
            return this.outboundAlias(providerId, cmsSubjectId, existing);
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
            return this.outboundAlias(providerId, cmsSubjectId, winner);
        }
        return generated;
    }

    async resolve(scope: ProviderIdentityScope, providerSubjectId: string | number): Promise<string | null> {
        const subject = await this.identities.resolve(
            { authority: providerAuthority(scope), kind: "user", value: providerSubjectId },
            "cms",
        );
        if (subject === null) {
            return null;
        }
        if (typeof subject !== "string") {
            throw new TypeError("CMS identity subject is invalid");
        }
        return subject;
    }

    private async outboundAlias(providerId: string, cmsSubjectId: string, value: IdentityValue): Promise<string> {
        const alias = outboundAlias(value);
        const alternate =
            typeof value === "number"
                ? alias
                : Number.isFinite(Number(alias)) && String(Number(alias)) === alias
                  ? Number(alias)
                  : null;
        if (alternate !== null) {
            const claimant = await this.identities.resolve(
                { authority: providerId, kind: "user", value: alternate },
                "cms",
            );
            if (claimant !== null && claimant !== cmsSubjectId) {
                throw new TypeError("provider identity alias is ambiguous over HTTP");
            }
        }
        return alias;
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
    const alias = String(value);
    if (!/^[\x20-\x7e]{1,256}$/.test(alias)) {
        throw new TypeError("provider identity alias cannot be transmitted");
    }
    return alias;
}
