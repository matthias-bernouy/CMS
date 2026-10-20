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
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials: stores.credentials,
        resolver: new SubjectResolver(stores.users),
        codec: new SignedCookieCodec(new TextEncoder().encode(stores.runtimeSessionSecret)),
        pats: stores.pats,
        rateLimit: stores.rateLimit,
        cookieName: "cms-session",
        cookieSecure: kernelUrl.startsWith("https:"),
        defaultHome: "/admin",
    });
    const shared = {
        local: auth,
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
        publicAuth: createPublicAuthActions({
            ...shared,
            emailVerificationUrl: `${origin}/auth/confirm-email`,
            passwordResetUrl: `${origin}/auth/reset-password`,
        }),
    };
}
