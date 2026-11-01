import { expect, test } from "bun:test";
import { admitContractRelease, resolveContract } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, planContractPublications } from "@bernouy/cms-repository/contracts/catalogue";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { capabilityDocument, contractDocument } from "../../support/fixtures";

test.each(["memory", "mongo"])(
    "%s supports deprecation toward an inherited replacement before major removal",
    async (adapter) => {
        const catalogue =
            adapter === "memory" ? new InMemoryReleaseCatalogue() : new MongoReleaseCatalogue(fakeCatalogueDb());
        const base = await admitContractRelease(contractDocument({ contractId: "example.base", version: "1.0.0" }));
        await catalogue.publish(base);
        const child = (version: string, replacedBy?: string) =>
            admitContractRelease(
                contractDocument({
                    contractId: "example.child",
                    version,
                    extends: {
                        contractId: base.release.contractId,
                        version: base.release.version,
                        digest: base.digest,
                    },
                    capabilities: [
                        ...(version === "2.0.0"
                            ? []
                            : [
                                  capabilityDocument({
                                      id: "legacy.send",
                                      ...(replacedBy ? { deprecation: { replacedBy } } : {}),
                                      bindings: [
                                          { transport: "http", method: "POST", path: "/legacy", input: { body: true } },
                                      ],
                                  }),
                              ]),
                        capabilityDocument({
                            id: "configure",
                            bindings: [
                                { transport: "http", method: "POST", path: "/configure", input: { body: true } },
                            ],
                        }),
                    ],
                }),
            );
        await catalogue.publish(await child("1.0.0"));
        await catalogue.publish(await child("1.1.0", "email.message.send"));
        const target = await child("2.0.0");
        await catalogue.publish(target);
        expect((await resolveContract(catalogue, target)).capabilities.map(({ definition }) => definition.id)).toEqual([
            "email.message.send",
            "configure",
        ]);
        const missing = await child("1.2.0", "missing.operation");
        await expect(catalogue.publish(missing)).rejects.toThrow("must identify another capability");
        await expect(resolveContract(catalogue, missing)).rejects.toThrow("must identify another capability");
        await expect(planContractPublications(catalogue, [missing])).rejects.toThrow(
            "must identify another capability",
        );
        expect(await catalogue.get("example.child", "1.2.0")).toBeNull();
        expect(await catalogue.list()).toHaveLength(4);
    },
);
