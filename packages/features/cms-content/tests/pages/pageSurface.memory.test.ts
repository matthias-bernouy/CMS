import { describe, expect, test } from "bun:test";
import {
    ContentValidationError,
    InMemoryCmsRepository,
    pageDocument,
    ValidatingCmsRepository,
} from "@bernouy/cms-content";

const origin = {
    sourceId: "ulvia",
    contributionId: "ulvia-official",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}`,
    pageId: "overview",
    generation: 1,
} as const;

describe("site Page surface ownership", () => {
    test("defaults existing authoring to Delivery and exposes one shared document", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/about", "About", "<main>About</main>");

        const page = (await repository.getPage("/about"))!;
        expect(page.surface).toBe("delivery");
        expect(pageDocument(page)).toEqual({ html: "<main>About</main>" });
    });

    test("creates a Control Page with immutable contribution provenance", async () => {
        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        await repository.insertPage("/admin/overview", "Overview", "", {
            surface: "control",
            origin,
        });

        const page = (await repository.getPage("/admin/overview"))!;
        expect(page).toMatchObject({ surface: "control", origin });
        await expect(repository.updatePage({ id: page.id, surface: "delivery" }, page.revision)).rejects.toThrow(
            ContentValidationError,
        );
        await expect(repository.updatePage({ id: page.id, origin }, page.revision)).rejects.toThrow(
            ContentValidationError,
        );
    });

    test("rejects malformed contribution provenance", async () => {
        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        await expect(
            repository.insertPage("/admin/overview", "Overview", undefined, {
                surface: "control",
                origin: { ...origin, digest: "not-a-digest" },
            }),
        ).rejects.toThrow(ContentValidationError);
    });
});
