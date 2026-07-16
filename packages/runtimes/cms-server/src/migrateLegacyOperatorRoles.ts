import type { UsersRepository } from "@bernouy/cms-auth";
import { ADMIN_ROLE, type RolesRepository } from "@bernouy/cms-permissions";

const LEGACY_OPERATOR_ROLES = ["support", "finance"] as const;
const MIGRATION_BATCH_SIZE = 100;

export type LegacyOperatorRoleMigration = {
    promotedUsers: number;
    removedRoleDefinitions: string[];
};

export async function migrateLegacyOperatorRoles(
    users: UsersRepository<string>,
    roles: RolesRepository,
): Promise<LegacyOperatorRoleMigration> {
    let promotedUsers = 0;

    for (const role of LEGACY_OPERATOR_ROLES) {
        while (true) {
            const page = await users.list({
                role,
                pagination: { page: 1, limit: MIGRATION_BATCH_SIZE },
            });
            if (page.total === 0) break;
            if (page.users.length === 0) throw new Error(`Unable to migrate legacy role ${role}`);

            for (const user of page.users) {
                const updated = await users.setRole(user.sub, ADMIN_ROLE);
                if (updated?.role !== ADMIN_ROLE) {
                    throw new Error(`Unable to promote a user from legacy role ${role}`);
                }
                promotedUsers++;
            }
        }
    }

    const removedRoleDefinitions: string[] = [];
    for (const role of LEGACY_OPERATOR_ROLES) {
        if (!await roles.get(role)) continue;
        await roles.delete(role);
        removedRoleDefinitions.push(role);
    }

    return { promotedUsers, removedRoleDefinitions };
}
