import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { TUser, UsersRepository } from "cms-auth/interfaces/UsersRepository";
import { internalUserId } from "cms-auth/core/SubjectResolver";
import { validatePassword } from "cms-auth/core/validation";

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
