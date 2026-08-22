import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsRepository } from "cms-cli/dev-server/repo/LocalFsCmsRepository";

describe("LocalFsCmsRepository pages", () => {
    test("moves the page file when its path changes", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-pages-"));
        const repository = new LocalFsCmsRepository(siteDir, new Map());
        await repository.insertPage("/pricing", "Pricing");

        const page = await repository.getPageById("/pricing");
        expect(page).not.toBeNull();

        await repository.updatePage({
            ...page!,
            path: "/plans",
            title: "Plans",
            description: "Updated description",
            tags: ["featured"],
            visible: false,
            indexing: {
                enabled: true,
                entity: {
                    sourceUrn: "urn:commerce",
                    entityId: "product-by-slug",
                    pageQueryParam: "product",
                },
            },
        });

        expect(await repository.getPageById("/pricing")).toBeNull();
        expect(await repository.getPageById("/plans")).toMatchObject({
            id: "/plans",
            path: "/plans",
            title: "Plans",
            description: "Updated description",
            tags: ["featured"],
            visible: false,
            indexing: {
                enabled: true,
                entity: {
                    sourceUrn: "urn:commerce",
                    entityId: "product-by-slug",
                    pageQueryParam: "product",
                },
            },
        });
        expect(existsSync(join(siteDir, "pages", "pricing.html"))).toBe(false);
        expect(existsSync(join(siteDir, "pages", "plans.html"))).toBe(true);
    });
});
