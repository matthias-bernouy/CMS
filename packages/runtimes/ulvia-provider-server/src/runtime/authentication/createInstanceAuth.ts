import { createPublicAuthActions, LocalAuthentication, SignedCookieCodec, SubjectResolver } from "@bernouy/cms-auth";
import type { ProviderStores } from "../stores/providerStores";

export async function createInstanceAuth(stores: ProviderStores, cmsUrl: string) {
    const auth = new LocalAuthentication({
        providerId: "local",
        credentials: stores.credentials,
        resolver: new SubjectResolver(stores.users),
        codec: new SignedCookieCodec(new TextEncoder().encode(stores.runtimeSessionSecret)),
        pats: stores.pats,
        rateLimit: stores.rateLimit,
    });
    const shared = {
        credentials: stores.credentials,
        users: stores.users,
        tokens: stores.authTokens,
        emailer: stores.emailer,
        siteName: "Ulvia CMS",
        authEmailCooldownSeconds: 300,
    };
    const origin = cmsUrl.replace(/\/$/u, "");
    return {
        auth,
        accountLifecycle: createPublicAuthActions({
            ...shared,
            emailVerificationUrl: `${origin}/confirm-email`,
            passwordResetUrl: `${origin}/reset-password`,
            buildEmailVerificationUrl: (token) => authActionUrl(origin, "/confirm-email", token),
            buildPasswordResetUrl: (token) => authActionUrl(origin, "/reset-password", token),
        }),
    };
}

function authActionUrl(origin: string, path: string, token: string): string {
    const url = new URL(path, `${origin}/`);
    url.searchParams.set("ulvia-official-auth-token", token);
    return url.toString();
}
