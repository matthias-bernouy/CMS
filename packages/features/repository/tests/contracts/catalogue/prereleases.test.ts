import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import {
    capabilityDocument,
    contractDocument,
    objectSchema,
    stringSchema,
} from "../../../../../platform/contracts/tests/support/fixtures";

const release = (version: string, maximum = 100) =>
    admitContractRelease(
        contractDocument({
            version,
            capabilities: [capabilityDocument({ input: objectSchema({ name: stringSchema(maximum) }, ["name"]) })],
        }),
    );

describe("prerelease target evolution", () => {
    test("allows new preview capabilities to evolve while stable identities stay compatible", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await release("1.0.0"));
        const preview = async (version: string, maximum: number) => {
            const stable = (await release("1.0.0")).release.capabilities[0]!;
            return admitContractRelease(
                contractDocument({
                    version,
                    capabilities: [
                        stable,
                        {
                            ...stable,
                            id: "email.message.deliver",
                            input: objectSchema({ name: stringSchema(maximum) }, ["name"]),
                            bindings: stable.bindings.map((binding) => ({ ...binding, path: "/v2/messages" })),
                        },
                    ],
                }),
            );
        };
        await catalogue.publish(await preview("2.0.0-alpha.1", 50));
        await catalogue.publish(await preview("2.0.0-alpha.2", 150));
        await catalogue.publish(await preview("2.0.0-beta.1", 30));
        await expect(catalogue.publish(await preview("2.0.0", 80))).resolves.toMatchObject({
            admission: { release: { version: "2.0.0" } },
        });
    });

    test("checks every minor preview against the stable line, not its previous preview", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await release("1.0.0"));
        await catalogue.publish(await release("1.1.0-alpha.1", 150));
        await expect(catalogue.publish(await release("1.1.0-alpha.2", 120))).resolves.toBeDefined();
        await expect(catalogue.publish(await release("1.1.0-alpha.3", 90))).rejects.toThrow("major change");
        await expect(catalogue.publish(await release("1.1.0", 110))).resolves.toBeDefined();
    });

    test("preserves preview ordering, stable maintenance and target bump requirements", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await release("1.0.0"));
        await catalogue.publish(await release("1.1.0-alpha.2", 150));
        await expect(catalogue.publish(await release("1.1.0-alpha.1", 150))).rejects.toThrow("version must increase");
        await expect(catalogue.publish(await release("1.0.1-alpha.1", 150))).rejects.toThrow("minor change");
        await expect(catalogue.publish(await release("1.0.1"))).resolves.toBeDefined();
        await catalogue.publish(await release("1.1.0", 150));
        await expect(catalogue.publish(await release("1.1.0-beta.1", 150))).rejects.toThrow("version must increase");
    });
});
