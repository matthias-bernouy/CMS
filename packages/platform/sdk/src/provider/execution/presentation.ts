import type { ProviderCapabilityInvocationContext, ProviderRoute } from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderRegistrationOptions } from "ulvia-sdk/interfaces/runtime";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import { CapabilityFailure } from "ulvia-sdk/definitions/errors";
import { presentCapabilityFailure } from "ulvia-sdk/provider/execution/failures";
import { selectedRoute } from "ulvia-sdk/provider/execution/routes";

export type CapturedHandler = (
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext,
) => unknown;
export type RoutingClaims = (
    context: ProviderCapabilityInvocationContext,
) => Pick<ProviderInvocationClaims, "contractId" | "contractVersion">;
export function presentedHandler<Dependencies>(
    entry: RuntimeCapabilityPlan<Dependencies>,
    handler: CapturedHandler,
    routes: readonly ProviderRoute[],
    options: ProviderRegistrationOptions,
    claimsFor: RoutingClaims,
    stored = false,
) {
    return async (input: Readonly<Record<string, unknown>>, context: ProviderCapabilityInvocationContext) => {
        try {
            return await handler(input, context);
        } catch (error) {
            if (!(error instanceof CapabilityFailure) || error.capability !== entry.source) {
                throw error;
            }
            const route = selectedRoute(
                routes,
                entry.contractId,
                entry.capability.id,
                context,
                claimsFor(context),
                stored,
            );
            throw presentCapabilityFailure(error, entry.capability, route, options, context);
        }
    };
}
