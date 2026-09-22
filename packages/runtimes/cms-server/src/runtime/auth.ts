import {
    AuthValidationError,
    createPublicAuthActions,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    TemplatedAuthEmailComposer,
} from "@bernouy/cms-auth";
import { ConfiguredEmailer } from "@bernouy/cms-auth/smtp";
import { createAuthEmailTestSender, createLocalUser } from "@bernouy/cms-auth/management";
import type { RuntimeEnv } from "../runtimeEnv";
import type { CoreStores } from "./stores/core";

export async function createProductionAuth(env: RuntimeEnv, stores: CoreStores) {
    if (!(await stores.identityProviders.get("local"))) {
        await stores.identityProviders.create({
            id: "local",
            kind: "local",
            enabled: true,
            displayName: "Email & password",
        });
    }

    if (!(await stores.credentials.getByEmail(env.CMS_ADMIN_EMAIL))) {
        try {
            await createLocalUser(
                { credentials: stores.credentials, users: stores.users },
                {
                    email: env.CMS_ADMIN_EMAIL,
                    password: env.CMS_ADMIN_PASSWORD,
                },
            );
        } catch (error) {
            if (error instanceof AuthValidationError) {
                throw new Error(`Invalid CMS_ADMIN_PASSWORD for first admin bootstrap: ${error.message}`);
            }
            throw error;
        }
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
        cookieSecure: env.CONTROL_PUBLIC_URL.startsWith("https"),
        defaultHome: "/admin/pages",
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
        createControlEmailTest: () =>
            createAuthEmailTestSender({
                ...publicAuthBase,
                emailVerificationUrl: env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
            }),
    };
}

export type ProductionAuthentication = Awaited<ReturnType<typeof createProductionAuth>>;
