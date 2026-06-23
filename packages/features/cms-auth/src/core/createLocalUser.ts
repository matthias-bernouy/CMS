import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { TUser, UsersRepository } from "cms-auth/interfaces/UsersRepository";
import { internalUserId } from "cms-auth/core/SubjectResolver";
import { validatePassword } from "cms-auth/core/validation";

export type CreateLocalUserStores<Role extends string = string> = {
    credentials: LocalCredentialStore;
    users:       UsersRepository<Role>;
};

export type CreateLocalUserInput<Role extends string = string> = {
    email:          string;
    password:       string;
    displayName?:   string;
    role:           Role;
    emailVerified?: boolean;
};

export async function createLocalUser<Role extends string>(
    stores: CreateLocalUserStores<Role>,
    input: CreateLocalUserInput<Role>,
): Promise<TUser<Role>> {
    validatePassword(input.password);
    const identity = await stores.credentials.create({
        email:          input.email,
        password:       input.password,
        displayName:    input.displayName,
        emailVerified:  input.emailVerified ?? true,
    });
    return stores.users.upsert(
        { ...identity, sub: internalUserId("local", identity.sub), provider: "local" },
        input.role,
    );
}
