import type { z } from "zod";
import type { CapabilityDeprecation } from "@bernouy/ulvia-contracts";

export interface EventDefinition<Schema extends z.ZodType = z.ZodType> {
    readonly id: string;
    readonly schema: Schema;
    readonly sensitive: boolean;
    readonly filterKeys?: readonly string[];
    readonly description?: string;
    readonly docs?: readonly string[];
    readonly deprecation?: CapabilityDeprecation;
}
export type EventPayload<Event extends EventDefinition> = z.input<Event["schema"]>;
