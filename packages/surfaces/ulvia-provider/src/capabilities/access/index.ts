import { readSystemSnapshot } from "@bernouy/cms-content";
import { deleteUserCompletely } from "@bernouy/cms-auth/management";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsAccessDependencies, UlviaProviderGateway } from "../../ports";
import { registerAccessConfigurationCapabilities } from "./configuration";
import {
    accessCommand,
    actorSubject,
    administratorState,
    projectIdentityProvider,
    projectSite,
    projectUser,
    requiredGateway,
    requiredText,
    revision,
} from "./support";

export function registerAccessCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsAccessDependencies,
    gateway: UlviaProviderGateway | undefined,
): void {
    dispatcher.register("ulvia.cms.access", "overview", async (input) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 50;
        const [site, page, loginProviders] = await Promise.all([
            readSystemSnapshot(dependencies.repo),
            dependencies.users.list({ pagination: { page: 1, limit } }),
            dependencies.identityProviders.list(),
        ]);
        const administrators = await Promise.all(page.users.map((user) => administratorState(gateway, user.sub)));
        return {
            site: projectSite(site.system, site.revision),
            users: page.users.map((user, index) => projectUser(user, administrators[index]!)),
            totalUsers: page.total,
            loginProviders: loginProviders.map(projectIdentityProvider),
        };
    });
    dispatcher.register("ulvia.cms.access", "list-users", async (input) => {
        const page = await dependencies.users.list({
            ...(typeof input.search === "string" ? { search: input.search } : {}),
            pagination: {
                page: Number.isSafeInteger(input.page) ? Number(input.page) : 1,
                limit: Number.isSafeInteger(input.limit) ? Number(input.limit) : 50,
            },
        });
        const administrators = await Promise.all(page.users.map((user) => administratorState(gateway, user.sub)));
        return { ...page, users: page.users.map((user, index) => projectUser(user, administrators[index]!)) };
    });
    dispatcher.register("ulvia.cms.access", "get-user", async (input) => {
        const sub = requiredText(input.sub);
        const user = await dependencies.users.getBySub(sub);
        if (!user) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectUser(user, await administratorState(gateway, sub));
    });
    dispatcher.register("ulvia.cms.access", "set-administrator", async (input, context) =>
        accessCommand(async () => {
            const active = requiredGateway(gateway);
            const sub = requiredText(input.sub);
            if (!(await dependencies.users.getBySub(sub))) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            const enabled = input.enabled === true;
            if (!enabled && (await actorSubject(active, context)) === sub) {
                throw new ProviderCapabilityDispatchError("CANNOT_REMOVE_SELF", 409);
            }
            const state = await active.administrators.set(sub, enabled, revision(input.expectedRevision));
            return {
                sub,
                administrator: state.enabled,
                revision: state.revision,
                bootstrap: state.bootstrap,
            };
        }),
    );
    dispatcher.register("ulvia.cms.access", "delete-user", async (input, context) =>
        accessCommand(async () => {
            const active = requiredGateway(gateway);
            const sub = requiredText(input.sub);
            if ((await actorSubject(active, context)) === sub) {
                throw new ProviderCapabilityDispatchError("CANNOT_REMOVE_SELF", 409);
            }
            if (!(await active.administrators.canRevoke(sub))) {
                throw new ProviderCapabilityDispatchError("PROTECTED_USER", 409);
            }
            const user = await dependencies.users.getBySub(sub);
            if (!user) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            await deleteUserCompletely(
                {
                    users: dependencies.users,
                    credentials: dependencies.credentials,
                    pats: dependencies.pats,
                    beforeMembershipDelete: async () => {
                        const state = await active.administrators.get(sub);
                        if (state.enabled) {
                            await active.administrators.set(sub, false, state.revision);
                        }
                    },
                },
                user,
            );
            return { sub, deleted: true };
        }),
    );
    registerAccessConfigurationCapabilities(dispatcher, dependencies);
}
