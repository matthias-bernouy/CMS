import { describe, expect, test } from "bun:test";
import {
    admitContractRelease,
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

    test("publishes a self-contained specialization after its pinned parent", async () => {
        const parent = await admitContractRelease(contractDocument({ version: "1.0.0" }));
        const smtp = capabilityDocument({
            id: "email.smtp.configure",
            binding: {
                transport: "http",
                method: "PUT",
                path: "/v1/smtp/configuration",
                input: { body: true },
            },
        });
        const child = await admitContractRelease(
            contractDocument({
                contractId: "communication.email.smtp",
                name: "SMTP Email",
                version: "1.0.0",
                extends: parentReference(parent),
                capabilities: [capabilityDocument(), smtp],
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
    });

    test("rejects missing, changed, or unpinned inherited capabilities", async () => {
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
            catalogue.publish(await specialized([capabilityDocument({ id: "smtp.configure" })])),
        ).rejects.toThrow("must include inherited capability");
        await expect(
            catalogue.publish(
                await specialized([
                    capabilityDocument({ description: "A specialization cannot redefine this description." }),
                ]),
            ),
        ).rejects.toThrow("cannot override inherited capability");
        await expect(catalogue.publish(await specialized([capabilityDocument()], digest("b")))).rejects.toThrow(
            "is not published",
        );
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
