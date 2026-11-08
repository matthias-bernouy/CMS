import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository, createContentReader } from "@bernouy/content";
import type { ContentRepository } from "@bernouy/content";
import { PageCapabilityAnalyzer } from "@bernouy/content/public-delivery";
import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";

const requirement = { contractId: "ulvia/cms.secrets", capabilityId: "secrets.list", versionRange: "^1.0.0" };
async function setup() {
    const repository = new InMemoryContentRepository();
    await repository.createBloc({
        id: "private-card",
        kind: "component",
        name: "Private",
        group: "Base",
        description: "",
        root: { accepts: ["div"] },
        viewJS: "",
        markupHTML: "<slot></slot>",
        requires: [requirement],
    });
    await repository.insertPage("/private", "Private", '<div cms-bloc="private-card"></div>');
    const page = (await repository.getPage("/private"))!;
    await repository.updatePage({ id: page.id, visible: true });
    return repository;
}

test("stored requirements reach access analysis and refuse incompatible selected versions", async () => {
    const repository = await setup();
    const inputs = await createContentReader(repository).getPageRenderInputs("/private");
    if (inputs.route?.kind !== "current") {
        throw new Error("Expected a published Page");
    }
    expect(inputs.route.page.requirements).toEqual([requirement]);
    const analyzer = new PageCapabilityAnalyzer({
        satisfiesVersionRange,
        resolveCapability: async () => ({ access: "admin", version: "1.0.0" }),
    });
    expect(await analyzer.requiredAccess(inputs.route.page)).toBe("admin");
    const incompatible = new PageCapabilityAnalyzer({
        satisfiesVersionRange,
        resolveCapability: async () => ({ access: "admin", version: "2.0.0" }),
    });
    expect(await incompatible.requiredAccess(inputs.route.page)).toBeNull();
});

test("custom repositories without the optional contribution port still retain stored requirements", async () => {
    const raw = await setup();
    const custom: ContentRepository = new Proxy(raw, {
        get(target, key) {
            if (key === "getPageRequirements") {
                return undefined;
            }
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    for (const repository of [custom, new ValidatingContentRepository(custom)]) {
        const inputs = await createContentReader(repository).getPageRenderInputs("/private");
        if (inputs.route?.kind !== "current") {
            throw new Error("Expected a published Page");
        }
        expect(inputs.route.page.requirements).toEqual([requirement]);
    }
});
