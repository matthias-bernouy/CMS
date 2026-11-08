import { expect, test } from "bun:test";
import { contractString, capabilitiesFor, z } from "@bernouy/ulvia-sdk";
import { executeCapability } from "@bernouy/ulvia-sdk/local";

interface Services {
    values: { write(value: number): number };
}
const defineCapability = capabilitiesFor<Services>();
const context = { requestId: "local", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };
const exposure = {
    id: "write",
    access: "public",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: false },
    bindings: [],
} as const;
const schema = z.strictObject({ value: z.number() });

// A long executor may be an ordinary function outside its operation module.
function writeValue({ input, services }: { input: z.output<typeof schema>; services: Services }): number {
    return services.values.write(input.value);
}
const capability = defineCapability({
    ...exposure,
    input: schema,
    output: z.number(),
    errors: {},
    execute: writeValue,
});

test("local execution uses the capability's Zod schemas and rejects input before business state changes", async () => {
    let writes = 0;
    const services = {
        values: {
            write: (value: number) => {
                writes++;
                return value;
            },
        },
    };
    for (const input of [{ value: "wrong" }, { value: 1, extra: true }, {}]) {
        await expect(executeCapability(capability, { input, services, context })).rejects.toBeInstanceOf(z.ZodError);
    }
    expect(writes).toBe(0);
    expect(await executeCapability(capability, { input: { value: 4 }, services, context })).toBe(4);
    expect(writes).toBe(1);
});

test("local execution checks output and keeps typed capability failures bound to their owner", async () => {
    await expect(
        executeCapability(capability, {
            input: { value: 4 },
            services: { values: { write: () => "wrong" as never } },
            context,
        }),
    ).rejects.toBeInstanceOf(z.ZodError);
    const failure = defineCapability({
        ...exposure,
        input: schema,
        output: z.number(),
        errors: {
            REFUSED: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 128 }) }) },
        },
        execute: ({ fail }) => {
            throw fail("REFUSED", { message: "Refused" });
        },
    });
    await expect(
        executeCapability(failure, { input: { value: 4 }, services: { values: { write: (value) => value } }, context }),
    ).rejects.toMatchObject({ capability: failure, code: "REFUSED", output: { message: "Refused" } });
});
