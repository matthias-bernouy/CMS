import { describe, expect, test } from "bun:test";
import { admitContractRelease, computeReleaseDigest } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

describe("release snapshot ownership", () => {
    test("admission and publication own frozen copies without freezing caller mock data", async () => {
        const input = Object.freeze({ context: { label: "initial" } });
        const output = { messageId: "original" };
        const document = contractDocument({
            capabilities: [
                capabilityDocument({
                    input: objectSchema({ context: objectSchema({ label: stringSchema() }, ["label"]) }, ["context"]),
                    mocks: [{ id: "example", input, outcome: { kind: "success", output } }],
                }),
            ],
        });
        const admission = await admitContractRelease(document);
        const published = await new InMemoryReleaseCatalogue().publish(admission);
        const mock = published.admission.release.capabilities[0]!.mocks![0]!;

        expect(mock.input).not.toBe(input);
        expect(mock.input.context).not.toBe(input.context);
        expect(Object.isFrozen(mock.input.context)).toBe(true);
        expect(Object.isFrozen(mock.outcome.output)).toBe(true);
        expect(Object.isFrozen(input.context)).toBe(false);
        expect(Object.isFrozen(output)).toBe(false);
        input.context.label = "caller update";
        output.messageId = "caller update";
        expect(mock.input.context).toEqual({ label: "initial" });
        expect(mock.outcome.output).toEqual({ messageId: "original" });
        expect(await computeReleaseDigest(published.admission.release)).toBe(admission.digest);
    });

    test("deepFreeze traverses shallow-frozen containers and shared or circular references once", () => {
        const child: { label: string; parent?: object } = { label: "example" };
        const value = Object.freeze({ first: child, second: child });
        child.parent = value;

        expect(deepFreeze(value)).toBe(value);
        expect(Object.isFrozen(child)).toBe(true);
    });
});
