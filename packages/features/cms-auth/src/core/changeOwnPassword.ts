import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { TUser } from "cms-auth/interfaces/UsersRepository";
import { AuthValidationError, validatePassword } from "cms-auth/core/validation";

export type ChangeOwnPasswordStores = {
    credentials: LocalCredentialStore;
};

export async function changeOwnPassword(
    stores: ChangeOwnPasswordStores,
    user: TUser<string>,
    currentPassword: string,
    newPassword: string,
): Promise<void> {
    if (user.provider !== "local") {
        throw new AuthValidationError("provider", "password change is only available for local accounts");
    }
    if (!user.email) throw new AuthValidationError("email", "no email on file");

    validatePassword(newPassword);

    const identity = await stores.credentials.verify(user.email, currentPassword);
    if (!identity) throw new AuthValidationError("currentPassword", "incorrect");

    const changed = await stores.credentials.setPassword(identity.sub, newPassword);
    if (!changed) throw new AuthValidationError("credential", "not found after password verification");
}
