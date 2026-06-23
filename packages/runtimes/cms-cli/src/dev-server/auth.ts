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

export async function createDevAuth() {
    const users = new InMemoryUsersRepository<CMS_ROLES>();
    const credentials = new InMemoryLocalCredentialStore();
    const devAdmin = await createLocalUser({ credentials, users }, {
        email: "dev@example.com",
        password: DEV_PASSWORD,
        displayName: "p9r dev",
        role: "admin",
    });

    await users.upsert({ sub: "demo-user", displayName: "Demo User", email: "demo@example.com" }, "user");

    const identityProviders = new InMemoryIdentityProviderRepository();
    const auth = new InMemoryAuthentication({
        role: "admin",
        identifier: devAdmin.sub,
        displayName: "p9r dev",
    });
    const pats = new InMemoryPatRepository();

    return { auth, users, identityProviders, pats, credentials, devAdmin };
}
