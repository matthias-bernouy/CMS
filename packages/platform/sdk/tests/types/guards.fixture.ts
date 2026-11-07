import { capabilitiesFor, contractString, z } from "@bernouy/ulvia-sdk";
import type { CapabilityOutput } from "@bernouy/ulvia-sdk";
const author = capabilitiesFor<{ notes: { allowed(id: string): Promise<boolean> } }>();
const guarded = author({
    id: "guarded",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [],
    input: z.strictObject({ id: contractString({ maxLength: 128 }) }),
    output: z.array(z.boolean()).max(2).readonly(),
    errors: { DENIED: { retryable: false, output: z.boolean() } },
    authorize: async ({ input, services, fail }) => {
        await services.notes.allowed(input.id);
        // @ts-expect-error Guard input retains the declared schema.
        void input.missing;
        // @ts-expect-error Guards use the same service ports as execution.
        void services.users;
        // @ts-expect-error Guard failure codes remain declared.
        fail("UNKNOWN", false);
        // @ts-expect-error Guard failures cannot widen the declared payload.
        fail("DENIED", "private");
    },
    execute: () => [true] as const,
});
const output: CapabilityOutput<typeof guarded> = [true] as const;
void output;
const permission = contractString({ enum: ["read", "write"], maxLength: 32 });
type Permission = z.infer<typeof permission>;
const valid: Permission = "read";
// @ts-expect-error Enum adapters preserve literal unions rather than widening to string.
const invalid: Permission = "unknown";
void [valid, invalid];
