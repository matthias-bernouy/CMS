import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import { MemoryCollectionStorage } from "repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
import { CollectionUpgradeService } from "../../../../src/collections/installations/upgrades/runtime/CollectionUpgradeService";
import { MemorySiteUpgradeStorage } from "repository/site-upgrades/memory";
import { prepareCollectionUpgrade } from "../../../../src/collections/installations/upgrades/planning/plan";
import { collectionDocument } from "../../fixtures";
import { collectionFixture } from "../../admission/examples/buildFixture";

test.each([
    ['<main><main><slot name="body"></slot></main></main>', "nested inside"],
    ['<section><a href="/missing">{{ copy }}</a><slot name="body"></slot></section>', "unavailable route"],
])(
    "upgrade planning refuses incompatible expanded template %s before changing installed or Page state",
    async (markup, message) => {
        const repository = new InMemoryContentRepository();
        const collections = new CollectionStore(new MemoryCollectionStorage());
        const source = collectionDocument() as any;
        source.blocs = [source.blocs[0]];
        const previous = await collections.importRelease(collectionFixture(source));
        await collections.install("site", previous.digest, 0);
        await repository.insertPage("/source", "Source", '<div cms-bloc="atlas-dofficial--atlas--panel"></div>');
        const page = (await repository.getPage("/source"))!;
        await repository.updatePage({ id: page.id, visible: true }, page.revision);
        const before = await repository.getPageById(page.id);
        const next = await collections.importRelease(
            collectionFixture({
                ...source,
                version: "2.0.0",
                blocs: [{ ...source.blocs[0], markup }],
            }),
        );
        const plan = await prepareCollectionUpgrade(repository, collections, "site", [{ digest: next.digest }], {
            contributors: [],
            requiredConsumers: [],
            validateCapabilities: async () => [],
        });
        expect(plan.status).toBe("blocked");
        expect(plan.issues).toContainEqual(
            expect.objectContaining({
                code: "incompatible-content",
                location: expect.stringContaining(page.id),
                message: expect.stringContaining(message),
            }),
        );
        expect(await collections.revision("site")).toBe(1);
        expect(await repository.getPageById(page.id)).toEqual(before);
    },
);

test.each(["draft", "published", "budget"] as const)(
    "reviewed upgrades distinguish truncated reports from %s verification failures",
    async (scenario) => {
        const repository = new InMemoryContentRepository();
        const collections = new CollectionStore(new MemoryCollectionStorage());
        const source = collectionDocument();
        const previous = await collections.importRelease(source);
        await collections.install("site", previous.digest, 0);
        const next = await collections.importRelease({ ...source, version: "1.1.0" });
        let body = '<a href="/missing">Missing</a>'.repeat(40);
        if (scenario === "budget") {
            for (let i = 0; i < 40; i++) {
                await repository.insertPage(`/target-${i}`, "Target");
                const target = (await repository.getPage(`/target-${i}`))!;
                await repository.updatePage({ id: target.id, visible: true }, target.revision);
                body += `<a href="/target-${i}">Target</a>`;
            }
        }
        const content = `<div cms-bloc="atlas-dofficial--atlas--panel"><div slot="body">${body}</div></div>`;
        await repository.insertPage("/docs", "Docs", content);
        const page = (await repository.getPage("/docs"))!;
        if (scenario === "published") {
            await repository.updatePage({ id: page.id, visible: true }, page.revision);
        }
        const before = await repository.getAllPages();
        const service = new CollectionUpgradeService(repository, collections, new MemorySiteUpgradeStorage(), {
            contributors: [],
            requiredConsumers: [],
            validateCapabilities: async () => [],
        });
        const targets = [{ digest: next.digest }];
        const plan = await service.plan("site", targets);
        expect(plan.status).toBe(
            scenario === "draft" ? "applicable" : scenario === "budget" ? "incomplete" : "blocked",
        );
        expect(await collections.revision("site")).toBe(1);
        expect(await repository.getAllPages()).toEqual(before);
        if (scenario === "draft") {
            expect(plan.issues).toEqual([]);
            expect((await service.apply("site", targets, plan.planDigest)).status).toBe("completed");
            expect(await collections.revision("site")).toBe(2);
        } else {
            expect(plan.issues).toContainEqual(
                expect.objectContaining({
                    code: scenario === "budget" ? "incomplete" : "incompatible-content",
                    location: expect.stringContaining(page.id),
                }),
            );
            await expect(service.apply("site", targets, plan.planDigest)).rejects.toThrow(
                "stale, blocked or incomplete",
            );
            expect(await collections.revision("site")).toBe(1);
        }
        expect(await repository.getAllPages()).toEqual(before);
    },
);
