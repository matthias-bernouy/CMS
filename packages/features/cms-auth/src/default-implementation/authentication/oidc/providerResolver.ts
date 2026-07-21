import type { SecretReader } from "@bernouy/cms-secrets";
import type { IdentityProvider, IdentityProviderRepository } from "cms-auth/interfaces/IdentityProvider";

type ResolvedOidcProvider = {
    p: IdentityProvider;
    secret: string;
};

export async function resolveOidcProvider(
    request: Request,
    providers: IdentityProviderRepository,
    secrets: SecretReader,
    acceptsIssuer: (issuer: string) => boolean,
): Promise<ResolvedOidcProvider | null> {
    // Provider id is the segment before /login|/callback, independent of the base path.
    const match = new URL(request.url).pathname.match(/\/([^/]+)\/(?:login|callback)$/);
    const id = match?.[1];
    if (!id) {
        return null;
    }
    const provider = await providers.get(id);
    if (!provider || !provider.enabled || provider.kind !== "oidc" || !provider.issuer || !provider.clientId) {
        return null;
    }

    if (!acceptsIssuer(provider.issuer)) {
        console.warn(
            `OIDC: provider "${id}" rejected — issuer "${provider.issuer}" is not https (set allowInsecureIssuer to permit http in dev).`,
        );
        return null;
    }

    const secretKey = provider.clientSecretRef?.replace(/^\$\{(.+)\}$/, "$1");
    const secret = secretKey ? ((await secrets.get(secretKey)) ?? "") : "";
    return { p: provider, secret };
}
