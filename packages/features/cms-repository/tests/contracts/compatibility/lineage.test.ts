import { describe, expect, test } from "bun:test";
import {
    admitContractRelease,
    effectiveLineageCapabilities,
    findImplementedContract,
    parseContractRelease,
    resolveContractLineage,
} from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { capabilityDocument, contractDocument } from "../support/fixtures";

describe("contract specialization", () => {
    test("parses one exact parent reference", () => {
        const release = parseContractRelease(
            contractDocument({
                contractId: "communication.email.smtp",
                extends: {
                    contractId: "communication.email",
                    version: "1.0.0",
                    digest: digest("a"),
                },
            }),
        );

        expect(release.extends).toEqual({
            contractId: "communication.email",
            version: "1.0.0",
            digest: digest("a"),
        });
        expect(() =>
            parseContractRelease(
                contractDocument({
                    extends: { contractId: "communication.email", version: "1.0.0", digest: digest("a") },
                }),
            ),
        ).toThrow("cannot extend itself");
    });

    test("publishes an additive specialization after its pinned parent", async () => {
        const parent = await admitContractRelease(contractDocument({ version: "1.0.0" }));
        const smtp = capabilityDocument({
            id: "email.smtp.configure",
            bindings: [
                { id: "http", transport: "http", method: "PUT", path: "/v1/smtp/configuration", input: { body: true } },
            ],
        });
        const child = await admitContractRelease(
            contractDocument({
                contractId: "communication.email.smtp",
                name: "SMTP Email",
                version: "1.0.0",
                extends: parentReference(parent),
                capabilities: [smtp],
            }),
        );
        const catalogue = new InMemoryReleaseCatalogue();

        const published = await publishContractSet(catalogue, [child, parent]);
        const lineage = await resolveContractLineage(catalogue, child.release);

        expect(published.map(({ release }) => release.contractId)).toEqual([
            "communication.email",
            "communication.email.smtp",
        ]);
        expect(lineage.map(({ contractId }) => contractId)).toEqual([
            "communication.email.smtp",
            "communication.email",
        ]);
        expect(await findImplementedContract(catalogue, child.release, "communication.email")).toEqual(parent.release);
        expect(effectiveLineageCapabilities(lineage).map(({ id }) => id)).toEqual([
            "email.message.send",
            "email.smtp.configure",
        ]);
    });

    test("rejects redeclared or unpinned inherited capabilities", async () => {
        const parent = await admitContractRelease(contractDocument({ version: "1.0.0" }));
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(parent);
        const specialized = (capabilities: readonly Record<string, unknown>[], digestValue = parent.digest) =>
            admitContractRelease(
                contractDocument({
                    contractId: "communication.email.smtp",
                    version: "1.0.0",
                    extends: { ...parentReference(parent), digest: digestValue },
                    capabilities,
                }),
            );

        await expect(
            catalogue.publish(await specialized([capabilityDocument({ id: "email.message.send" })])),
        ).rejects.toThrow("cannot redeclare inherited capability");
        await expect(
            catalogue.publish(await specialized([capabilityDocument({ id: "smtp.configure" })], digest("b"))),
        ).rejects.toThrow("is not published");
    });

    test("treats changing the exact parent as a major evolution", () => {
        const previous = parseContractRelease(
            contractDocument({
                contractId: "communication.email.smtp",
                version: "1.0.0",
                extends: { contractId: "communication.email", version: "1.0.0", digest: digest("a") },
            }),
        );
        const next = parseContractRelease({
            ...previous,
            version: "1.1.0",
            extends: { ...previous.extends, version: "1.1.0", digest: digest("b") },
        });

        expect(compareContractReleases(previous, next)).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
            issues: expect.arrayContaining([expect.objectContaining({ code: "parent_changed" })]),
        });
    });
});

function parentReference(parent: Awaited<ReturnType<typeof admitContractRelease>>) {
    return {
        contractId: parent.release.contractId,
        version: parent.release.version,
        digest: parent.digest,
    };
}

function digest(character: string): `sha256:${string}` {
    return `sha256:${character.repeat(64)}`;
}
