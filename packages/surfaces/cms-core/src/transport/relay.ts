import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import { RequestBodyTooLargeError } from "@bernouy/http-runner";
import {
    CoreCapabilityDispatchError,
    type CoreCapabilityDispatcher,
    type CoreCapabilityInvocationContext,
} from "../dispatch/registry";
import { coreInvocationContext } from "./context";
import { decodeCoreContractInput } from "./input";
import type { CoreRoute } from "./routes";

export function createCoreContractRelay(
    routes: readonly CoreRoute[],
    dispatcher: CoreCapabilityDispatcher,
): (request: Request) => Promise<Response | null> {
    return async (request) => {
        const url = new URL(request.url);
        const selected = routes
            .map((route) => ({ route, parameters: route.match(request.method, url.pathname) }))
            .find(({ parameters }) => parameters !== null);
        if (!selected?.parameters) {
            return null;
        }
        const { contractId, capability } = selected.route;
        let input: Readonly<Record<string, unknown>>;
        let context: CoreCapabilityInvocationContext;
        try {
            input = await decodeCoreContractInput(request, url, capability, selected.parameters);
            validateSchemaValue(capability.input, input);
            context = coreInvocationContext(request);
            validateIdempotencyContext(capability, context);
        } catch (cause) {
            return new Response(null, {
                status: cause instanceof RequestBodyTooLargeError ? 413 : 400,
                headers: { "Cache-Control": "no-store" },
            });
        }
        try {
            const output = await dispatcher.invoke(contractId, capability.id, input, context);
            if (capability.behavior.execution === "operation") {
                parseCapabilityOperationHandle(output);
            } else {
                validateSchemaValue(capability.output, output);
            }
            return successResponse(request.method, capability, output);
        } catch (cause) {
            if (cause instanceof CoreCapabilityDispatchError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                if (status === cause.status) {
                    return Response.json(
                        { error: { code: cause.code } },
                        { status, headers: { "Cache-Control": "no-store" } },
                    );
                }
            }
            return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
        }
    };
}

function validateIdempotencyContext(capability: CapabilityDefinition, context: CoreCapabilityInvocationContext): void {
    const keyed = capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
    if (Boolean(context.idempotencyKey) !== keyed) {
        throw new TypeError(keyed ? "Missing idempotency key." : "Unexpected idempotency key.");
    }
}

function successResponse(method: string, capability: CapabilityDefinition, output: unknown): Response {
    const status = capability.binding.response.successStatuses[0]!;
    const headers = { "Cache-Control": "no-store" };
    if (method === "HEAD" || status === 204 || status === 205) {
        return new Response(null, { status, headers });
    }
    return Response.json(output, { status, headers });
}
