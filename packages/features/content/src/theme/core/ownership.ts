import type { ThemeSourceOwner } from "content/theme/interfaces/theme";

/** Namespaced static resources share CSS isolation with legacy contributions, not their lifecycle. */
export function themeResourceOwner(owner: ThemeSourceOwner | undefined) {
    if (owner?.kind === "contribution") {
        return { namespace: owner.contributionId, tokenImports: owner.tokenImports };
    }
    return owner?.kind === "resource" ? owner : undefined;
}
