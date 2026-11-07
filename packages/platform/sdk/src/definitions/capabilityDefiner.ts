import type {
    CapabilityServiceRequirement,
    CapabilityExecutor,
    CapabilityAuthorization,
} from "ulvia-sdk/interfaces/execution";
import type { z } from "zod";
import type { CapabilityAccess, CapabilityBehavior, CapabilityBinding } from "@bernouy/ulvia-contracts";
import type { CapabilityDefinition, CapabilityErrors } from "ulvia-sdk/interfaces/capabilities";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";

export function createCapabilityDefiner<Services>() {
    function defineCapability<
        const Input extends z.ZodObject,
        const Output extends z.ZodType,
        const Errors extends CapabilityErrors,
        const Id extends string,
        const Access extends CapabilityAccess,
        const Behavior extends CapabilityBehavior,
        const Bindings extends readonly CapabilityBinding[],
    >(
        definition: Omit<
            CapabilityDefinition<Input, Output, Errors>,
            "id" | "access" | "behavior" | "bindings" | "mocks"
        > & {
            readonly id: Id;
            readonly access: Access;
            readonly behavior: Behavior;
            readonly bindings: Bindings;
            readonly mocks?: CapabilityDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>>["mocks"];
            readonly execute?: never;
            readonly authorize?: never;
        },
    ): CapabilityDefinition<Input, Output, Errors> &
        Readonly<{ id: Id; access: Access; behavior: Behavior; bindings: Bindings }> &
        CapabilityServiceRequirement<Services>;
    function defineCapability<
        const Input extends z.ZodObject,
        const Output extends z.ZodType,
        const Errors extends CapabilityErrors,
        const Id extends string,
        const Access extends CapabilityAccess,
        const Behavior extends CapabilityBehavior,
        const Bindings extends readonly CapabilityBinding[],
    >(
        definition: Omit<
            CapabilityDefinition<Input, Output, Errors>,
            "id" | "access" | "behavior" | "bindings" | "mocks"
        > & {
            readonly id: Id;
            readonly access: Access;
            readonly behavior: Behavior;
            readonly bindings: Bindings;
            readonly mocks?: CapabilityDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>>["mocks"];
            readonly authorize?: never;
            readonly execute: CapabilityExecutor<
                CapabilityDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>> &
                    Readonly<{ behavior: NoInfer<Behavior> }>,
                Services
            >;
        },
    ): CapabilityDefinition<Input, Output, Errors> &
        Readonly<{ id: Id; access: Access; behavior: Behavior; bindings: Bindings }> &
        CapabilityServiceRequirement<Services> & {
            readonly authorize?: never;
            readonly execute: CapabilityExecutor<
                CapabilityDefinition<Input, Output, Errors> & Readonly<{ behavior: Behavior }>,
                Services
            >;
        };
    function defineCapability<
        const Input extends z.ZodObject,
        const Output extends z.ZodType,
        const Errors extends CapabilityErrors,
        const Id extends string,
        const Access extends CapabilityAccess,
        const Behavior extends CapabilityBehavior,
        const Bindings extends readonly CapabilityBinding[],
    >(
        definition: Omit<
            CapabilityDefinition<Input, Output, Errors>,
            "id" | "access" | "behavior" | "bindings" | "mocks"
        > & {
            readonly id: Id;
            readonly access: Access;
            readonly behavior: Behavior;
            readonly bindings: Bindings;
            readonly mocks?: CapabilityDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>>["mocks"];
            readonly authorize: CapabilityAuthorization<
                CapabilityDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>> &
                    Readonly<{ behavior: NoInfer<Behavior> }>,
                Services
            >;
            readonly execute: CapabilityExecutor<
                CapabilityDefinition<NoInfer<Input>, NoInfer<Output>, NoInfer<Errors>> &
                    Readonly<{ behavior: NoInfer<Behavior> }>,
                Services
            >;
        },
    ): CapabilityDefinition<Input, Output, Errors> &
        Readonly<{ id: Id; access: Access; behavior: Behavior; bindings: Bindings }> &
        CapabilityServiceRequirement<Services> & {
            readonly authorize: CapabilityAuthorization<
                CapabilityDefinition<Input, Output, Errors> & Readonly<{ behavior: Behavior }>,
                Services
            >;
            readonly execute: CapabilityExecutor<
                CapabilityDefinition<Input, Output, Errors> & Readonly<{ behavior: Behavior }>,
                Services
            >;
        };
    function defineCapability(definition: CapabilitySource & { readonly execute?: unknown }): CapabilitySource {
        return Object.freeze({ ...definition });
    }
    return defineCapability;
}
