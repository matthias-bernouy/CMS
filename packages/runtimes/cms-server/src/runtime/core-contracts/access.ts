import type { CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CoreStores } from "../stores/core";
import type { ProductionGateway } from "../gateway/createProductionGateway";

export function registerAccessCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CoreStores,
    gateway: ProductionGateway | undefined,
): void {
    dispatcher.register("ulvia.cms.access", "overview", async (input) => {
        const limit = Number.isSafeInteger(input.limit) ? Number(input.limit) : 50;
        const [system, page, loginProviders, administratorIds] = await Promise.all([
            core.repo.getSystem(),
            core.users.list({ pagination: { page: 1, limit } }),
            core.identityProviders.list(),
            gateway?.administrators.list() ?? Promise.resolve([]),
        ]);
        const administrators = new Set(administratorIds);
        return {
            site: {
                name: system.site.name,
                host: system.site.host,
                language: system.site.language,
                visible: system.site.visible,
            },
            users: page.users.map((user) => ({
                sub: user.sub,
                ...(user.email ? { email: user.email } : {}),
                ...(user.provider ? { provider: user.provider } : {}),
                administrator: administrators.has(user.sub),
                createdAt: user.createdAt.toISOString(),
                lastSeenAt: user.lastSeenAt.toISOString(),
            })),
            totalUsers: page.total,
            loginProviders: loginProviders.map(({ id, kind, displayName, enabled }) => ({
                id,
                kind,
                displayName,
                enabled,
            })),
        };
    });
}
