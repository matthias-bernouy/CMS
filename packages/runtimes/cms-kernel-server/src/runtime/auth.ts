import {
    createPublicAuthActions,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    TemplatedAuthEmailComposer,
} from "@bernouy/cms-auth";
import { ConfiguredEmailer } from "@bernouy/cms-auth/smtp";
import { createAuthEmailTestSender } from "@bernouy/cms-auth/management";
import type { RuntimeEnv } from "../runtimeEnv";
import type { KernelStores } from "./stores/kernelStores";

export async function createProductionAuth(env: RuntimeEnv, stores: KernelStores) {
    const localProvider = await stores.identityProviders.get("local");
    if (!localProvider || !localProvider.enabled) {
        throw new Error("The instance has not been provisioned with an enabled local identity provider");
    }

    const resolver = new SubjectResolver(stores.users);
    const auth = new LocalAuthentication({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials: stores.credentials,
        resolver,
        codec: new SignedCookieCodec(new TextEncoder().encode(env.CMS_SESSION_SECRET)),
        pats: stores.pats,
        rateLimit: stores.rateLimit,
        cookieName: "cms-session",
        cookieSecure: env.KERNEL_PUBLIC_URL.startsWith("https"),
        defaultHome: "/admin",
    });
    const publicAuthBase = {
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
        siteName: env.CMS_AUTH_SITE_NAME,
        authEmailCooldownSeconds: env.CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
    };
    return {
        auth,
        createPublicAuth(options: { emailVerificationUrl: string; passwordResetUrl: string; allowSignup?: boolean }) {
            return { ...createPublicAuthActions({ ...publicAuthBase, ...options }), allowSignup: options.allowSignup };
        },
        createEmailTest: () =>
            createAuthEmailTestSender({
                ...publicAuthBase,
                emailVerificationUrl: env.CMS_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: env.CMS_AUTH_PASSWORD_RESET_URL,
            }),
    };
}

export type ProductionAuthentication = Awaited<ReturnType<typeof createProductionAuth>>;
