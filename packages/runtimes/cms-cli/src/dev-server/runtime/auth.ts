import {
    InMemoryAuthentication,
    InMemoryIdentityProviderRepository,
    InMemoryLocalCredentialStore,
    InMemoryPatRepository,
    InMemoryUsersRepository,
    createLocalUser,
} from "@bernouy/cms-auth";
import type { CMS_ROLES } from "@bernouy/cms-permissions";

export const DEV_PASSWORD = "password";
export const DEV_ADMIN_SUBJECT = "local:dev-admin";

export async function createDevAuth() {
    const users = new InMemoryUsersRepository<CMS_ROLES>();
    const credentials = new InMemoryLocalCredentialStore({
        seededSubjects: { "dev@example.com": "dev-admin" },
    });
    const devAdmin = await createLocalUser(
        { credentials, users },
        {
            email: "dev@example.com",
            password: DEV_PASSWORD,
            role: "admin",
        },
    );

    await users.upsert({ sub: "demo-user", email: "demo@example.com" }, "user");

    const identityProviders = new InMemoryIdentityProviderRepository();
    const auth = new InMemoryAuthentication({
        role: "admin",
        identifier: devAdmin.sub,
        email: "dev@example.com",
    });
    const pats = new InMemoryPatRepository();

    return { auth, users, identityProviders, pats, credentials, devAdmin };
}
