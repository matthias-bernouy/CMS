import { personalAccessTokenInput, PersonalAccessTokenLimitError } from "@bernouy/cms-auth";
import type { Pat } from "@bernouy/cms-auth";
import { officialFailure } from "../../dispatch/errors/failure";
import { ProviderCapabilityDispatchError } from "../../dispatch/registry";
import type { ProviderCapabilityRegistry, ProviderCapabilityInvocationContext } from "../../dispatch/registry";
import type { CmsAccessDependencies, UlviaProviderGateway } from "../../ports/index";
import { accessCommand, actorSubject, requiredGateway, requiredText } from "./support";

export function registerPersonalAccessCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: Pick<CmsAccessDependencies, "pats" | "users">,
    gateway: UlviaProviderGateway | undefined,
): void {
    const subject = async (context: ProviderCapabilityInvocationContext) => {
        const sub = await actorSubject(requiredGateway(gateway), context);
        if (!(await dependencies.users.getBySub(sub))) {
            throw new ProviderCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
        }
        return sub;
    };
    dispatcher.register("ulvia/cms.access", "create-personal-access-token", async (input, context) =>
        accessCommand(async () => {
            const sub = await subject(context);
            try {
                const created = await dependencies.pats.create({ sub, ...personalAccessTokenInput(input) });
                return { token: created.token, metadata: projectPat(created.pat) };
            } catch (error) {
                if (error instanceof PersonalAccessTokenLimitError) {
                    throw officialFailure("TOKEN_LIMIT", 409, error);
                }
                throw error;
            }
        }),
    );
    dispatcher.register("ulvia/cms.access", "list-personal-access-tokens", async (_input, context) =>
        accessCommand(async () => ({
            tokens: (await dependencies.pats.list(await subject(context))).map(projectPat),
        })),
    );
    dispatcher.register("ulvia/cms.access", "revoke-personal-access-token", async (input, context) =>
        accessCommand(async () => {
            if (!(await dependencies.pats.revoke(await subject(context), requiredText(input.id)))) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            return { revoked: true };
        }),
    );
}

function projectPat(pat: Pat) {
    return {
        id: pat.id,
        name: pat.name,
        createdAt: pat.createdAt.toISOString(),
        expiresAt: pat.expiresAt?.toISOString() ?? null,
        ...(pat.lastUsedAt ? { lastUsedAt: pat.lastUsedAt.toISOString() } : {}),
    };
}
