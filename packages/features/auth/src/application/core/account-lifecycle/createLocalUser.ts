import type { LocalCredentialStore } from "auth/providers/interfaces/LocalCredentialStore";
import type { TUser, UsersRepository } from "auth/accounts/interfaces/UsersRepository";
import { internalUserId } from "auth/accounts/core/SubjectResolver";
import { validatePassword } from "auth/application/core/validation";

export type CreateLocalUserStores = {
    credentials: LocalCredentialStore;
    users: UsersRepository;
};

export type CreateLocalUserInput = {
    email: string;
    password: string;
    emailVerified?: boolean;
};

export async function createLocalUser(stores: CreateLocalUserStores, input: CreateLocalUserInput): Promise<TUser> {
    validatePassword(input.password);
    const identity = await stores.credentials.create({
        email: input.email,
        password: input.password,
        emailVerified: input.emailVerified ?? true,
    });
    return stores.users.upsert({ ...identity, sub: internalUserId("local", identity.sub), provider: "local" });
}
