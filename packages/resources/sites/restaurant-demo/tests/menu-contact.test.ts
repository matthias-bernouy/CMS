import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = join(ROOT, "site", "pages");
const routes = new Set(["/", "/split", "/cover", "/menu-tabs", "/menu-stacked", "/contact"]);

describe("restaurant menu and contact demos", () => {
    test("compares category and stacked menu presentations", async () => {
        const categories = await page("menu-tabs.html");
        const stacked = await page("menu-stacked.html");

        for (const source of [categories, stacked]) {
            expect(source.match(/<restaurant-header\b/g)).toHaveLength(1);
            expect(source.match(/<restaurant-menu-catalog\b/g)).toHaveLength(1);
            expect(source.match(/<h1\b/g)).toHaveLength(1);
            expect(source.match(/<restaurant-menu-section\b/g)?.length).toBeGreaterThanOrEqual(3);
            expect(source.match(/<restaurant-menu-item\b/g)?.length).toBeGreaterThanOrEqual(6);
            expect(source).toContain('slot="icon" viewBox="0 0 24 24"');
            expect(source).not.toContain("<script");
            expect(source).not.toContain("fetch(");
            assertSafeLinks(source);
        }

        expect(categories).toContain('presentation="tabs" navigation="sticky" surface="plain" scheme="light"');
        expect(categories).toContain('emphasis="signature" availability="available"');
        expect(categories).toContain('media-position="end" media-ratio="landscape"');
        expect(categories).toContain('media-ratio="portrait"');
        expect(categories.match(/<img slot="media"/g)).toHaveLength(4);
        expect(categories).toContain('width="1598" height="984"');
        expect(stacked).toContain('presentation="stacked" navigation="static" surface="plain" scheme="light"');
        expect(stacked).toContain('columns="one" density="regular" icon="hide"');
        expect(stacked).not.toContain('emphasis="signature"');
        await access(join(ROOT, "site", "files", "restaurant", "signature-dish.png"));
    });

    test("compares three contact layouts and editorial opening states", async () => {
        const source = await page("contact.html");

        expect(source.match(/<restaurant-contact-card\b/g)).toHaveLength(3);
        expect(source.match(/<restaurant-contact-item\b/g)).toHaveLength(7);
        expect(source.match(/<basic-table slot="hours"/g)).toHaveLength(3);
        expect(source.match(/<basic-table-row>/g)).toHaveLength(17);
        expect(source.match(/<h1\b/g)).toHaveLength(1);
        expect(source).toContain('presentation="split" surface="card" scheme="light"');
        expect(source).toContain('presentation="stacked" surface="plain" scheme="light"');
        expect(source).toContain('presentation="sidebar" surface="card" scheme="dark"');
        expect(source).toContain("Currently open");
        expect(source).toContain("Closes in 45 minutes");
        expect(source).toContain("Currently closed");
        expect(source).toContain('href="tel:+33615649712"');
        expect(source).toContain('href="mailto:hello@passionne.example"');
        expect(source).not.toContain("<script");
        expect(source).not.toContain("fetch(");
        assertSafeLinks(source);
    });
});

async function page(name: string): Promise<string> {
    return await readFile(join(PAGES, name), "utf8");
}

function assertSafeLinks(source: string): void {
    for (const match of source.matchAll(/href="([^"]+)"/g)) {
        const href = match[1] ?? "";
        expect(routes.has(href) || /^(https:|tel:|mailto:)/.test(href)).toBe(true);
    }
}
