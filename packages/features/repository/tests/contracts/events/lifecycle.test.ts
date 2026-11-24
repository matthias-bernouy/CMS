import { expect, test } from "bun:test";
import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { contractDocument } from "../../../../../platform/contracts/tests/support/fixtures";

const event = { id: "payment.succeeded", sensitive: false, schema: { type: "string", maxLength: 64 } };
const release = (version: string, events: unknown[]) => admitContractRelease(contractDocument({ version, events }));

test("published event IDs cannot break across majors, disappear without retirement or be recycled", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(await release("1.0.0", [event]));
    await expect(
        catalogue.publish(await release("2.0.0", [{ ...event, schema: { type: "integer" } }])),
    ).rejects.toThrow("new event ID");
    const noEvents = await admitContractRelease(contractDocument({ version: "2.0.0" }));
    await expect(catalogue.publish(noEvents)).rejects.toThrow("retirement");
    await catalogue.publish(
        await release("1.0.1", [
            { ...event, deprecation: { retirement: true, reason: "Withdraw obsolete payment event." } },
        ]),
    );
    await catalogue.publish(noEvents);
    await expect(catalogue.publish(await release("3.0.0", [event]))).rejects.toThrow("cannot be reused");
});

test("event inheritance preserves declaring release pins and refuses redeclarations", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    const parent = await release("1.0.0", [event]);
    await catalogue.publish(parent);
    const child = await admitContractRelease(
        contractDocument({
            contractId: "ulvia/communication.email.special",
            capabilities: [],
            events: [{ ...event, id: "payment.refunded" }],
            extends: { contractId: parent.release.contractId, version: parent.release.version, digest: parent.digest },
        }),
    );
    await catalogue.publish(child);
    const resolved = await resolveContract(catalogue, child);
    expect(resolved.events.map(({ definition }) => definition.id)).toEqual(["payment.succeeded", "payment.refunded"]);
    expect(resolved.events[0]!.owner.digest).toBe(parent.digest);
    const duplicate = await admitContractRelease(
        contractDocument({
            contractId: "ulvia/communication.email.duplicate",
            capabilities: [],
            events: [event],
            extends: child.release.extends,
        }),
    );
    await expect(catalogue.publish(duplicate)).rejects.toThrow("inherited event");
});
