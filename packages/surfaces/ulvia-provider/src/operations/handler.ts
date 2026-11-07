import { RESPONSE_HEADERS, snapshotHeaders } from "@bernouy/cms-gateway/protocol";
import { localizeOfficialError } from "../dispatch/errors/localize";
import type { CapabilityErrorDefinition } from "@bernouy/ulvia-contracts";
import { projectSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { ProviderCapabilityDispatchError } from "../dispatch/registry";
import type { ProviderOperationHandler } from "./types";

/** Error details have the same declared-schema requirement as synchronous failures. */
export function validatedOperationHandler(
    handler: ProviderOperationHandler,
    errors:
        | readonly CapabilityErrorDefinition[]
        | ((version: string) => readonly CapabilityErrorDefinition[] | undefined),
    identity?: Readonly<{ contractId: string; capabilityId: string }>,
): ProviderOperationHandler {
    return async (...args) => {
        try {
            return await handler(...args);
        } catch (error) {
            if (error instanceof ProviderCapabilityDispatchError) {
                const declared = typeof errors === "function" ? errors(args[1].contractVersion) : errors;
                if (declared === undefined) {
                    throw new TypeError("Operation contract metadata is unavailable");
                }
                const definition = declared.find((candidate) => candidate.code === error.code);
                if (!definition && (typeof errors === "function" || declared.length > 0)) {
                    throw new TypeError("Operation returned an undeclared error code");
                }
                const schema = definition?.output;
                const localized = identity
                    ? localizeOfficialError(error, identity.contractId, identity.capabilityId, args[1])
                    : error;
                const output = schema ? projectSchemaValue(schema, localized.output) : undefined;
                throw new ProviderCapabilityDispatchError(
                    error.code,
                    error.status,
                    error.message,
                    snapshotHeaders(
                        Object.fromEntries(
                            Object.entries(localized.responseHeaders).map(([name, value]) => [
                                name.toLowerCase(),
                                value,
                            ]),
                        ),
                        RESPONSE_HEADERS,
                    ),
                    output,
                    localized.reason,
                );
            }
            throw error;
        }
    };
}
