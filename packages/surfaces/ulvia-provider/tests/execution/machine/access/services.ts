import { InMemoryLocalCredentialStore, InMemoryPatRepository, InMemoryUsersRepository } from "@bernouy/auth";
import type { AccessServices } from "@bernouy/auth/feature";
const unused = async (): Promise<never> => {
    throw new Error("Unexpected test service call");
};

/** Complete test ports; every unused authentication action fails loudly. */
export function accessServices(overrides: Partial<AccessServices> = {}): AccessServices {
    return {
        users: new InMemoryUsersRepository(),
        credentials: new InMemoryLocalCredentialStore(),
        pats: new InMemoryPatRepository(),
        ...overrides,
        authentication: {
            authenticate: overrides.authentication?.authenticate?.bind(overrides.authentication) ?? unused,
            resolveCredential: overrides.authentication?.resolveCredential?.bind(overrides.authentication) ?? unused,
            revokeCredential: overrides.authentication?.revokeCredential?.bind(overrides.authentication) ?? unused,
            revokeSessionsForSub:
                overrides.authentication?.revokeSessionsForSub?.bind(overrides.authentication) ?? unused,
        },
        accountLifecycle: {
            signup: unused,
            requestEmailVerification: unused,
            confirmEmailVerification: unused,
            requestPasswordReset: unused,
            confirmPasswordReset: unused,
            ...overrides.accountLifecycle,
        },
        mcpAuthorization: {
            deny: unused,
            register: unused,
            prepare: unused,
            exchange: unused,
            resolve: unused,
            authorize: unused,
            list: unused,
            revoke: unused,
            ...overrides.mcpAuthorization,
        },
        governance: {
            identities: { resolve: unused },
            ...overrides.governance,
            administrators: {
                get: async (sub) => ({ sub, enabled: false, revision: 0, bootstrap: false }),
                canRevoke: unused,
                set: unused,
                ...overrides.governance?.administrators,
            },
        },
    };
}
