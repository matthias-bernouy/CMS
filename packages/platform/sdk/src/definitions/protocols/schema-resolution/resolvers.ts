import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { z } from "zod";
import { contractString } from "ulvia-sdk/schema/adapters";
import { schemaChoicesInputSchema, schemaChoicesOutputSchema } from "./schemas";
import { schemaSelectorSchema as input, schemaDescriptorSchema as output } from "./schemas";
import { createCapabilityDefiner } from "ulvia-sdk/definitions/capabilityDefiner";
import type { CapabilityDefinition } from "ulvia-sdk/interfaces/capabilities";
import type {
    CapabilityExecutor,
    CapabilityAuthorization,
    CapabilityExecutionContext,
} from "ulvia-sdk/interfaces/execution";
const failureOutput = z.strictObject({ message: contractString({ maxLength: 512 }) });
const errors = {
    SCHEMA_VERSION_CONFLICT: { retryable: false, output: failureOutput },
    NOT_FOUND: { retryable: false, output: failureOutput },
    INVALID_INPUT: { retryable: false, output: failureOutput },
    FORBIDDEN: { retryable: false, output: failureOutput },
    CORE_UNAVAILABLE: { retryable: true, output: failureOutput },
} as const;
type Resolver = CapabilityDefinition<typeof input, typeof output, typeof errors>;
type ResolverContext<Selector extends z.ZodObject, Services> = CapabilityExecutionContext<Resolver, Services> & {
    readonly selector: z.output<Selector>;
};
export function schemaResolversFor<Services>() {
    const define = createCapabilityDefiner<Services>();
    return function defineSchemaResolver<const Id extends string, const Selector extends z.ZodObject>(options: {
        readonly id: Id;
        readonly path: string;
        readonly selector: Selector;
        readonly access?: "admin" | "authenticated" | "public";
        readonly docs?: readonly string[];
        readonly authorize: (execution: ResolverContext<Selector, Services>) => void | Promise<void>;
        readonly execute: (
            execution: ResolverContext<Selector, Services>,
        ) => ReturnType<CapabilityExecutor<Resolver, Services>>;
    }) {
        return define({
            id: options.id,
            access: options.access ?? "admin",
            schemaResolver: { selector: options.selector },
            behavior: { effect: "query", execution: "sync", sensitive: true },
            input,
            output,
            errors,
            authorize: (execution) =>
                options.authorize({
                    ...execution,
                    selector: parseStrictJson(execution.input.selectorJson, 16384, 16) as z.output<Selector>,
                }),
            ...(options.docs ? { docs: options.docs } : {}),
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "QUERY",
                    path: options.path,
                    input: { body: true },
                    response: {
                        successStatuses: [200],
                        contentTypes: ["application/json"],
                        errorStatuses: {
                            NOT_FOUND: 404,
                            INVALID_INPUT: 422,
                            FORBIDDEN: 403,
                            SCHEMA_VERSION_CONFLICT: 409,
                            CORE_UNAVAILABLE: 503,
                        },
                    },
                },
            ],
            execute: (execution) =>
                options.execute({
                    ...execution,
                    selector: parseStrictJson(execution.input.selectorJson, 16384, 16) as z.output<Selector>,
                }),
        });
    };
}

export function schemaChoicesFor<Services>() {
    const define = createCapabilityDefiner<Services>();
    return function defineSchemaChoices<const Id extends string>(options: {
        readonly id: Id;
        readonly path: string;
        readonly docs?: readonly string[];
        readonly authorize: CapabilityAuthorization<
            CapabilityDefinition<typeof schemaChoicesInputSchema, typeof schemaChoicesOutputSchema, typeof errors>,
            Services
        >;
        readonly execute: CapabilityExecutor<
            CapabilityDefinition<typeof schemaChoicesInputSchema, typeof schemaChoicesOutputSchema, typeof errors>,
            Services
        >;
    }) {
        return define({
            id: options.id,
            access: "admin",
            behavior: { effect: "query", execution: "sync", sensitive: true },
            input: schemaChoicesInputSchema,
            output: schemaChoicesOutputSchema,
            errors,
            authorize: options.authorize,
            execute: options.execute,
            ...(options.docs ? { docs: options.docs } : {}),
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "QUERY",
                    path: options.path,
                    input: { body: true },
                    response: {
                        successStatuses: [200],
                        contentTypes: ["application/json"],
                        errorStatuses: {
                            NOT_FOUND: 404,
                            INVALID_INPUT: 422,
                            FORBIDDEN: 403,
                            SCHEMA_VERSION_CONFLICT: 409,
                            CORE_UNAVAILABLE: 503,
                        },
                    },
                },
            ],
        });
    };
}
