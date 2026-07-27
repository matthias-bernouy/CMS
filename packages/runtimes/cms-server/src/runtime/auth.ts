import {
    AuthValidationError,
    ConfiguredEmailer,
    createLocalUser,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    TemplatedAuthEmailComposer,
} from "@bernouy/cms-auth";
import type { CMS_ROLES } from "@bernouy/cms-permissions";
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
                    role: "admin",
                },
            );
        } catch (error) {
            if (error instanceof AuthValidationError) {
                throw new Error(`Invalid CMS_ADMIN_PASSWORD for first admin bootstrap: ${error.message}`);
            }
            throw error;
        }
    }

    const resolver = new SubjectResolver<CMS_ROLES>(stores.users, "user");
    const auth = new LocalAuthentication<CMS_ROLES>({
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
        defaultRole: "user" as CMS_ROLES,
        siteName: env.CMS_AUTH_SITE_NAME,
        authEmailCooldownSeconds: env.CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
    };
    return { auth, publicAuthBase };
}

export type ProductionAuthentication = Awaited<ReturnType<typeof createProductionAuth>>;
