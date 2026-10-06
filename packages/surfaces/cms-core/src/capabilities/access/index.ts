import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import { readSystemSnapshot } from "@bernouy/cms-content";
import { deleteUserCompletely } from "@bernouy/cms-auth/management";
import type { CmsCoreCapabilityStores, CmsCoreGateway } from "../dependencies";
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
    dispatcher: CoreCapabilityRegistry,
    core: CmsCoreCapabilityStores,
    gateway: CmsCoreGateway | undefined,
): void {
    dispatcher.register("ulvia.cms.access", "overview", async (input) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 50;
        const [site, page, loginProviders] = await Promise.all([
            readSystemSnapshot(core.repo),
            core.users.list({ pagination: { page: 1, limit } }),
            core.identityProviders.list(),
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
        const page = await core.users.list({
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
        const user = await core.users.getBySub(sub);
        if (!user) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectUser(user, await administratorState(gateway, sub));
    });
    dispatcher.register("ulvia.cms.access", "set-administrator", async (input, context) =>
        accessCommand(async () => {
            const active = requiredGateway(gateway);
            const sub = requiredText(input.sub);
            if (!(await core.users.getBySub(sub))) {
                throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
            }
            const enabled = input.enabled === true;
            if (!enabled && (await actorSubject(active, context)) === sub) {
                throw new CoreCapabilityDispatchError("CANNOT_REMOVE_SELF", 409);
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
                throw new CoreCapabilityDispatchError("CANNOT_REMOVE_SELF", 409);
            }
            if (!(await active.administrators.canRevoke(sub))) {
                throw new CoreCapabilityDispatchError("PROTECTED_USER", 409);
            }
            const user = await core.users.getBySub(sub);
            if (!user) {
                throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
            }
            await deleteUserCompletely(
                {
                    users: core.users,
                    credentials: core.credentials,
                    pats: core.pats,
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
    registerAccessConfigurationCapabilities(dispatcher, core);
}
