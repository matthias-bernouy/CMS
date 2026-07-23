import type { RoleDefinition } from "cms-permissions/core/permissions";
import type { RolesRepository } from "cms-permissions/interfaces/RolesRepository";

const definitionsByRequest = new WeakMap<Request, WeakMap<RolesRepository, Promise<readonly RoleDefinition[]>>>();

/**
 * Resolves one immutable role snapshot per Request and repository. A rejected
 * load is evicted, and callers receive defensive copies.
 */
export async function resolveRequestRoleDefinitions(
    roles: RolesRepository,
    request: Request,
): Promise<RoleDefinition[]> {
    let repositories = definitionsByRequest.get(request);
    if (!repositories) {
        repositories = new WeakMap();
        definitionsByRequest.set(request, repositories);
    }
    let pending = repositories.get(roles);
    if (!pending) {
        pending = Promise.resolve()
            .then(() => roles.list())
            .then((definitions) => Object.freeze(structuredClone(definitions)));
        repositories.set(roles, pending);
        void pending.catch(() => {
            if (repositories?.get(roles) === pending) {
                repositories.delete(roles);
            }
        });
    }
    return (await pending).map((definition) => structuredClone(definition));
}
