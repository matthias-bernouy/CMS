import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import { deleteUserCompletely, updateIdentityProvider, type IdentityProviderPatch } from "@bernouy/cms-auth/management";
import type { CoreStores } from "../../stores/core";
import type { ProductionGateway } from "../../gateway/createProductionGateway";
import {
    accessCommand,
    actorSubject,
    administratorState,
    positiveRevision,
    projectIdentityProvider,
    projectSite,
    projectUser,
    requiredGateway,
    requiredText,
    revision,
} from "./support";

export function registerAccessCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CoreStores,
    gateway: ProductionGateway | undefined,
): void {
    dispatcher.register("ulvia.cms.access", "overview", async (input) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 50;
        const [system, siteRevision, page, loginProviders, administratorIds] = await Promise.all([
            core.repo.getSystem(),
            core.repo.getSystemRevision(),
            core.users.list({ pagination: { page: 1, limit } }),
            core.identityProviders.list(),
            gateway?.administrators.list() ?? Promise.resolve([]),
        ]);
        const administrators = new Set(administratorIds);
        return {
            site: projectSite(system, siteRevision),
            users: page.users.map((user) => projectUser(user, administrators.has(user.sub))),
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
        const administrators = new Set(await (gateway?.administrators.list() ?? Promise.resolve([])));
        return { ...page, users: page.users.map((user) => projectUser(user, administrators.has(user.sub))) };
    });
    dispatcher.register("ulvia.cms.access", "get-user", async (input) => {
        const sub = requiredText(input.sub);
        const user = await core.users.getBySub(sub);
        if (!user) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectUser(user, (await administratorState(gateway, sub)).enabled);
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
    registerConfigurationCapabilities(dispatcher, core);
}

function registerConfigurationCapabilities(dispatcher: CoreCapabilityRegistry, core: CoreStores): void {
    dispatcher.register("ulvia.cms.access", "update-login-provider", async (input) =>
        accessCommand(async () => {
            const patch = identityProviderPatch(input);
            if (Object.keys(patch).length === 0) {
                throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const provider = await updateIdentityProvider(
                { identityProviders: core.identityProviders, users: core.users },
                requiredText(input.providerId),
                patch,
                positiveRevision(input.expectedRevision),
            );
            return projectIdentityProvider(provider);
        }),
    );
    dispatcher.register("ulvia.cms.access", "update-site", async (input) =>
        accessCommand(async () => {
            if (input.name === undefined && input.host === undefined && input.visible === undefined) {
                throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const system = await core.repo.updateSystem(
                {
                    site: {
                        ...(input.name === undefined ? {} : { name: requiredText(input.name) }),
                        ...(input.host === undefined ? {} : { host: text(input.host) }),
                        ...(input.visible === undefined ? {} : { visible: boolean(input.visible) }),
                    },
                } as never,
                revision(input.expectedRevision),
            );
            return projectSite(system, await core.repo.getSystemRevision());
        }),
    );
}

function identityProviderPatch(input: Record<string, unknown>): IdentityProviderPatch {
    const patch: IdentityProviderPatch = {};
    for (const key of ["displayName", "icon", "clientId"] as const) {
        if (input[key] !== undefined) {
            patch[key] = requiredText(input[key]);
        }
    }
    for (const key of ["issuer", "authorizationEndpoint", "tokenEndpoint", "jwksUri"] as const) {
        if (input[key] !== undefined) {
            patch[key] = secureUrl(input[key]);
        }
    }
    if (input.enabled !== undefined) {
        patch.enabled = boolean(input.enabled);
    }
    if (input.scopes !== undefined) {
        if (!Array.isArray(input.scopes)) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        patch.scopes = input.scopes.map(requiredText);
    }
    return patch;
}

function secureUrl(value: unknown): string {
    const candidate = requiredText(value);
    try {
        const url = new URL(candidate);
        if (url.protocol !== "https:" || url.username || url.password || url.hash) {
            throw new Error("unsafe URL");
        }
        return url.toString();
    } catch {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

function text(value: unknown): string {
    if (typeof value !== "string") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
