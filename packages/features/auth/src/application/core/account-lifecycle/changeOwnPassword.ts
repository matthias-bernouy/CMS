import type { LocalCredentialStore } from "auth/providers/interfaces/LocalCredentialStore";
import type { TUser } from "auth/accounts/interfaces/UsersRepository";
import { AuthValidationError, validatePassword } from "auth/application/core/validation";

export type ChangeOwnPasswordStores = {
    credentials: LocalCredentialStore;
    revokeSessionsForSub(sub: string): Promise<void>;
};

export async function changeOwnPassword(
    stores: ChangeOwnPasswordStores,
    user: TUser,
    currentPassword: string,
    newPassword: string,
): Promise<void> {
    if (user.provider !== "local") {
        throw new AuthValidationError("provider", "password change is only available for local accounts");
    }
    if (!user.email) {
        throw new AuthValidationError("email", "no email on file");
    }

    validatePassword(newPassword);

    const identity = await stores.credentials.verify(user.email, currentPassword);
    if (!identity) {
        throw new AuthValidationError("currentPassword", "incorrect");
    }

    await stores.revokeSessionsForSub(user.sub);
    const changed = await stores.credentials.setPassword(identity.sub, newPassword);
    if (!changed) {
        throw new AuthValidationError("credential", "not found after password verification");
    }
    await stores.revokeSessionsForSub(user.sub);
}
