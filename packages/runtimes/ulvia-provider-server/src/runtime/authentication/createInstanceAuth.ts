import {
    createPublicAuthActions,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    TemplatedAuthEmailComposer,
} from "@bernouy/cms-auth";
import { ConfiguredEmailer } from "@bernouy/cms-auth/smtp";
import type { ProviderStores } from "../stores/providerStores";

export async function createInstanceAuth(stores: ProviderStores, kernelUrl: string) {
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
        emailer: new ConfiguredEmailer({
            readSettings: async () => (await stores.repo.getSystem()).email,
            secrets: stores.secrets,
        }),
        emailComposer: new TemplatedAuthEmailComposer({
            readTemplates: async () => (await stores.repo.getSystem()).email.templates,
        }),
        siteName: "Ulvia CMS",
        authEmailCooldownSeconds: 300,
    };
    const origin = kernelUrl.replace(/\/$/u, "");
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
