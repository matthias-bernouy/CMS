import type { SecretReader } from "@bernouy/secret-store";
import type { IdentityProvider, IdentityProviderRepository } from "cms-auth/providers/interfaces/IdentityProvider";

export type OidcProviderResolution =
    | Readonly<{ kind: "resolved"; provider: IdentityProvider; secret: string }>
    | Readonly<{ kind: "missing" }>
    | Readonly<{ kind: "issuer-rejected"; providerId: string; issuer: string }>;

export async function resolveOidcProvider(
    request: Request,
    providers: IdentityProviderRepository,
    secrets: SecretReader,
    acceptsIssuer: (issuer: string) => boolean,
): Promise<OidcProviderResolution> {
    // Provider id is the segment before /login|/callback, independent of the base path.
    const match = new URL(request.url).pathname.match(/\/([^/]+)\/(?:login|callback)$/);
    const id = match?.[1];
    if (!id) {
        return { kind: "missing" };
    }
    const provider = await providers.get(id);
    if (!provider || !provider.enabled || provider.kind !== "oidc" || !provider.issuer || !provider.clientId) {
        return { kind: "missing" };
    }

    if (!acceptsIssuer(provider.issuer)) {
        return { kind: "issuer-rejected", providerId: id, issuer: provider.issuer };
    }

    const secretKey = provider.clientSecretRef?.replace(/^\$\{(.+)\}$/, "$1");
    const secret = secretKey ? ((await secrets.get(secretKey)) ?? "") : "";
    return { kind: "resolved", provider, secret };
}
