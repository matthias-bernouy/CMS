import { ProviderCapabilityResponse } from "@bernouy/cms-gateway/provider/responses";
import { validateSchemaValue, projectSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { containsResolvedSchema } from "@bernouy/ulvia-contracts/resolution";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";

/** Retained builds project only after both concrete schema views have been validated. */
export async function projectRetainedOutput<Dependencies>(
    entry: RuntimeCapabilityPlan<Dependencies>,
    value: unknown,
    resolve?: (schema: UlviaSchema, value: unknown) => Promise<UlviaSchema>,
): Promise<unknown> {
    if (!entry.retainedOutputSchema) {
        return value;
    }
    const envelope = value instanceof ProviderCapabilityResponse ? value : undefined;
    if (envelope && entry.defaultOperation) {
        throw new TypeError("Durable default workers must return terminal JSON DTOs");
    }
    const output = envelope ? envelope.output : value;
    const materialize = async (schema: UlviaSchema) => {
        if (!containsResolvedSchema(schema)) {
            return schema;
        }
        if (!resolve) {
            throw new TypeError("Retained dynamic outputs require a schema resolution authority");
        }
        return resolve(schema, output);
    };
    validateSchemaValue(await materialize(entry.retainedOutputSchema), output);
    const projected = projectSchemaValue(await materialize(entry.capability.output), output);
    return envelope
        ? new ProviderCapabilityResponse(projected, envelope.responseEffect, envelope.representation)
        : projected;
}
