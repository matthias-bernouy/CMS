import type { ContractRelease, CapabilityDefinition } from "ulvia-contracts/interfaces/ContractRelease";
import type { UlviaObjectSchema, UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";
import { firstSchemaSubsetViolation } from "ulvia-contracts/core/compatibility/schemaAcceptance";
import { containsResolvedSchema, resolvedSchemaNodes } from "../traverse";
import {
    schemaResolverInputSchema,
    schemaDescriptorOutputSchema,
    schemaChoicesInputSchema,
    schemaChoicesOutputSchema,
} from "../protocol";
import { refusal, referenceSchema, jsonSchema, protocol } from "./proofs";
export { jsonSchema } from "./proofs";
function checkUsage(
    schema: UlviaSchema,
    input: UlviaSchema | undefined,
    capabilities: readonly CapabilityDefinition[],
    path: string,
    unresolvedParent: boolean,
    consumer?: CapabilityDefinition,
) {
    const nodes = resolvedSchemaNodes(schema);
    if (nodes.length > 32) {
        refusal(path, "a schema may contain at most 32 resolved fields");
    }
    for (const node of nodes) {
        const location = `${path}${node.path}`;
        const resolver = capabilities.find(({ id }) => id === node.schema.resolver);
        if (!resolver && unresolvedParent) {
            continue;
        }
        if (!resolver?.schemaResolver) {
            refusal(location, "resolved fields must reference a declared schema resolver");
        }
        const ranks = { public: 0, authenticated: 1, admin: 2 };
        if (consumer && ranks[resolver.access] > ranks[consumer.access]) {
            refusal(location, "a resolver cannot require greater access than its consuming capability");
        }
        const selector: UlviaObjectSchema = {
            type: "object",
            properties: Object.fromEntries(
                Object.entries(node.schema.selector).map(([key, reference]) => [
                    key,
                    referenceSchema(reference, schema, input, `${location}.selector.${key}`),
                ]),
            ),
            required: Object.keys(node.schema.selector),
        };
        const violation = firstSchemaSubsetViolation(
            selector,
            resolver.schemaResolver.selector,
            `${location}.selector`,
        );
        if (violation) {
            refusal(violation, "resolved selector references do not match the resolver selector schema");
        }
        if (node.schema.version) {
            const version = referenceSchema(node.schema.version, schema, input, `${location}.version`);
            if (
                ("nullable" in version && version.nullable) ||
                (version.type !== "string" && version.type !== "integer")
            ) {
                refusal(`${location}.version`, "versions must be required strings or integers");
            }
        }
        if (node.schema.choices) {
            const choices = capabilities.find(({ id }) => id === node.schema.choices);
            if (!choices && unresolvedParent) {
                continue;
            }
            if (!choices) {
                refusal(location, "schema choices capability is not declared");
            }
            protocol(choices, schemaChoicesInputSchema, schemaChoicesOutputSchema, location);
            if (consumer && ranks[choices.access] > ranks[consumer.access]) {
                refusal(location, "schema choices access is more restrictive than the consumer");
            }
        }
    }
}
export function validateSchemaResolvers(
    release: Pick<ContractRelease, "capabilities" | "events">,
    unresolvedParent = false,
) {
    for (const capability of release.capabilities) {
        if (capability.schemaResolver) {
            if (!capability.errors.some(({ code, retryable }) => code === "SCHEMA_VERSION_CONFLICT" && !retryable)) {
                refusal(
                    `$.capabilities.${capability.id}.errors`,
                    "schema resolvers must declare a nonretryable SCHEMA_VERSION_CONFLICT outcome",
                );
            }
            protocol(
                capability,
                schemaResolverInputSchema,
                schemaDescriptorOutputSchema,
                `$.capabilities.${capability.id}`,
            );
            const selector = capability.schemaResolver.selector;
            if (
                selector.nullable ||
                !selector.required.length ||
                containsResolvedSchema(selector) ||
                !jsonSchema(selector)
            ) {
                refusal(
                    `$.capabilities.${capability.id}.schemaResolver`,
                    "resolver selectors must be static nonempty JSON objects",
                );
            }
        }
        checkUsage(
            capability.input,
            capability.input,
            release.capabilities,
            `$.capabilities.${capability.id}.input`,
            unresolvedParent,
            capability,
        );
        checkUsage(
            capability.output,
            capability.input,
            release.capabilities,
            `$.capabilities.${capability.id}.output`,
            unresolvedParent,
            capability,
        );
        if (capability.errors.some(({ output }) => output && containsResolvedSchema(output))) {
            refusal(`$.capabilities.${capability.id}.errors`, "declared errors require static schemas");
        }
        if (
            capability.mocks?.length &&
            (containsResolvedSchema(capability.input) || containsResolvedSchema(capability.output))
        ) {
            refusal(
                `$.capabilities.${capability.id}.mocks`,
                "dynamic capability mocks need an execution-time resolver and cannot be admitted as static fixtures",
            );
        }
    }
    for (const event of release.events ?? []) {
        checkUsage(event.schema, undefined, release.capabilities, `$.events.${event.id}.schema`, unresolvedParent);
    }
}
