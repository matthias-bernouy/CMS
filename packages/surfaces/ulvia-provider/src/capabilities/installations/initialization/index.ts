import type { SiteInitializationService } from "@bernouy/cms-repository/collections/installations";
import { CollectionValidationError } from "@bernouy/cms-repository/collections";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { ProviderCapabilityInvocationContext, ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { ProviderOperationExecutor } from "../../../operations/ProviderOperationExecutor";
import type { UlviaProviderGateway } from "../../../ports";
import { officialFailure } from "../../../dispatch/errors/failure";

const CONTRACT = "ulvia/cms.installations";

export function registerInitializationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    initialization?: SiteInitializationService,
    operations?: ProviderOperationExecutor,
    gateway?: UlviaProviderGateway,
) {
    const service = (context: ProviderCapabilityInvocationContext) => {
        if (!initialization) {
            throw officialFailure("CORE_UNAVAILABLE", 503);
        }
        if (context.siteId !== initialization.siteId) {
            throw officialFailure("NOT_FOUND", 404);
        }
        return initialization;
    };
    const administrator = async (context: ProviderCapabilityInvocationContext) => {
        if (
            !context.subjectId ||
            context.systemServiceId ||
            context.sourceInstallationId ||
            context.controlAuthority ||
            !gateway
        ) {
            throw officialFailure("FORBIDDEN", 403);
        }
        const sub = await gateway.identities.resolve({ providerId: context.providerId }, context.subjectId);
        if (!sub || !(await gateway.administrators.get(sub)).enabled) {
            throw officialFailure("FORBIDDEN", 403);
        }
        return sub;
    };
    dispatcher.register(CONTRACT, "initialization.entry", async (_input, context) =>
        initializationCall(() => service(context).entry()),
    );
    dispatcher.register(CONTRACT, "initialization.status", async (_input, context) =>
        initializationCall(async () => {
            await administrator(context);
            const state = await service(context).status();
            const operation =
                operations && ["pending", "running"].includes(state.status)
                    ? await operations.store.latest(context.siteId, CONTRACT, "initialization.apply")
                    : null;
            const output = operation?.errorOutput;
            const errorMessage =
                operation?.status === "failed"
                    ? output && typeof output === "object" && "message" in output && typeof output.message === "string"
                        ? output.message
                        : "Setup stopped. Refresh its status and resume."
                    : "";
            return {
                ...state,
                operationId: operation?.id ?? "",
                operationStatus: operation?.status ?? "none",
                errorMessage,
            };
        }),
    );
    dispatcher.register(CONTRACT, "initialization.list", async (input, context) =>
        initializationCall(async () => {
            await administrator(context);
            return service(context).list(optionalText(input.cursor), optionalText(input.locale));
        }),
    );
    dispatcher.register(CONTRACT, "initialization.plan", async (input, context) =>
        initializationCall(async () => {
            const actorId = await administrator(context);
            const review = await service(context).plan(actorId, input.root, optionalText(input.locale), context.signal);
            return { planDigest: review.digest, reviewJson: canonicalizeIJson(review) };
        }),
    );
    const apply = "initialization.apply";
    if (operations) {
        operations.register(CONTRACT, apply, (input, context, execution) =>
            initializationCall(async () => {
                const actorId = await administrator(context);
                return service(context).apply(
                    actorId,
                    input.root,
                    requiredDigest(input.planDigest),
                    optionalText(input.locale),
                    { signal: execution.signal, assertHeld: () => execution.throwIfLeaseLost() },
                );
            }),
        );
    }
    dispatcher.register(CONTRACT, apply, async (input, context) =>
        initializationCall(async () => {
            await administrator(context);
            service(context);
            requiredDigest(input.planDigest);
            if (!operations) {
                throw officialFailure("CORE_UNAVAILABLE", 503);
            }
            return operations.enqueue(CONTRACT, apply, input, context);
        }),
    );
}

function requiredDigest(value: unknown): string {
    if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
        throw officialFailure("INVALID_INPUT", 422);
    }
    return value;
}
function optionalText(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw officialFailure("INVALID_INPUT", 422);
    }
    return value;
}
async function initializationCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
        if (status === 409) {
            throw officialFailure("REVISION_CONFLICT", 409, error);
        }
        if (status === 423) {
            throw officialFailure("UPGRADE_IN_PROGRESS", 423, error);
        }
        if (status === 404) {
            throw officialFailure("NOT_FOUND", 404, error);
        }
        if (error instanceof CollectionValidationError) {
            throw officialFailure("RELEASE_MISMATCH", 409, error);
        }
        if (error instanceof TypeError || error instanceof RangeError || status === 400 || status === 422) {
            throw officialFailure("INVALID_INPUT", 422, error);
        }
        throw officialFailure("CORE_UNAVAILABLE", 503, error);
    }
}
