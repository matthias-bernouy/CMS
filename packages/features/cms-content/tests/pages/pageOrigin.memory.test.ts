import { describe, expect, test } from "bun:test";
import {
    ContentValidationError,
    InMemoryContentRepository,
    pageDocument,
    ValidatingContentRepository,
} from "@bernouy/cms-content";

const origin = {
    sourceId: "ulvia",
    contributionId: "ulvia-official",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}`,
    pageId: "overview",
} as const;

describe("site Page ownership", () => {
    test("stores one shared Page document", async () => {
        const repository = new InMemoryContentRepository();
        await repository.insertPage("/about", "About", "<main>About</main>");
        expect(pageDocument((await repository.getPage("/about"))!)).toEqual({ html: "<main>About</main>" });
    });

    test("keeps contribution provenance immutable", async () => {
        const repository = new ValidatingContentRepository(new InMemoryContentRepository());
        await repository.insertPage("/admin/overview", "Overview", "", { origin });
        const page = (await repository.getPage("/admin/overview"))!;
        expect(page).toMatchObject({ origin });
        await expect(repository.updatePage({ id: page.id, origin }, page.revision)).rejects.toThrow(
            ContentValidationError,
        );
    });

    test("rejects malformed contribution provenance", async () => {
        const repository = new ValidatingContentRepository(new InMemoryContentRepository());
        await expect(
            repository.insertPage("/admin/overview", "Overview", undefined, {
                origin: { ...origin, digest: "not-a-digest" },
            }),
        ).rejects.toThrow(ContentValidationError);
    });
});
