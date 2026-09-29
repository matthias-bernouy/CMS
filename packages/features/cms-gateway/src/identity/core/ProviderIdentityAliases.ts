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
        const providerId = providerAuthority(scope);
        const subject = await this.identities.resolve(
            { authority: providerId, kind: "user", value: providerSubjectId },
            "cms",
        );
        const numeric = typeof providerSubjectId === "string" ? numericAlias(providerSubjectId) : null;
        const legacy =
            numeric === null
                ? null
                : await this.identities.resolve({ authority: providerId, kind: "user", value: numeric }, "cms");
        if (subject !== null && legacy !== null && subject !== legacy) {
            throw new TypeError("provider identity alias is ambiguous over HTTP");
        }
        const resolved = subject ?? legacy;
        if (resolved === null) {
            return null;
        }
        if (typeof resolved !== "string") {
            throw new TypeError("CMS identity subject is invalid");
        }
        return resolved;
    }

    private async outboundAlias(providerId: string, cmsSubjectId: string, value: IdentityValue): Promise<string> {
        const alias = outboundAlias(value);
        const alternate = typeof value === "number" ? alias : numericAlias(alias);
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

function numericAlias(value: string): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) && String(numeric) === value ? numeric : null;
}
