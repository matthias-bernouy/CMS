import type { z } from "zod";
import type { TUser } from "cms-auth/accounts/interfaces/UsersRepository";
import type { Pat } from "cms-auth/tokens/personal-access/interfaces/PatRepository";
import type { userViewSchema } from "cms-auth/application/schemas/users";
import type { patMetadataSchema } from "cms-auth/application/schemas/tokens";
export type AccessUser = z.infer<typeof userViewSchema>;
export type PublicPatMetadata = z.infer<typeof patMetadataSchema>;
export function projectUser(user: TUser, administrator: { enabled: boolean; revision: number }): AccessUser {
    return {
        sub: user.sub,
        ...(user.email ? { email: user.email } : {}),
        ...(user.provider ? { provider: user.provider } : {}),
        administrator: administrator.enabled,
        administratorRevision: administrator.revision,
        createdAt: user.createdAt.toISOString(),
        lastSeenAt: user.lastSeenAt.toISOString(),
    };
}
export function projectPat(pat: Pat): PublicPatMetadata {
    return {
        id: pat.id,
        name: pat.name,
        createdAt: pat.createdAt.toISOString(),
        expiresAt: pat.expiresAt?.toISOString() ?? null,
        ...(pat.lastUsedAt ? { lastUsedAt: pat.lastUsedAt.toISOString() } : {}),
    };
}
