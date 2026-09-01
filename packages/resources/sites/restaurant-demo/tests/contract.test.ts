import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const pages = new Map([
    ["index.html", "restaurant-hero-gallery"],
    ["split.html", "restaurant-hero-split"],
    ["cover.html", "restaurant-hero-cover"],
]);
const routes = new Set(["/", "/split", "/cover"]);

describe("restaurant demo site", () => {
    test("pins the required official integrations", async () => {
        expect(await json("integrations/basic-blocs.json")).toEqual({
            kind: "basic-blocs",
            version: "1.0.0",
            answers: {},
        });
        expect(await json("integrations/restaurant.json")).toEqual({
            kind: "restaurant",
            version: "1.0.0",
            answers: {},
        });
    });

    test("provides one safe page for every restaurant hero", async () => {
        for (const [file, hero] of pages) {
            const source = await readFile(join(SITE, "pages", file), "utf8");
            expect(source.match(/<restaurant-header\b/g)).toHaveLength(1);
            expect(source.match(new RegExp(`<${hero}\\b`, "g"))).toHaveLength(1);
            expect(source.match(/<h1\b/g)).toHaveLength(1);
            expect(source).toContain('autoplay="on"');
            expect(source).toContain('rotation-interval="5"');
            expect(source).toContain('menu-target="restaurant-menu"');
            expect(source).toContain(
                '<basic-badge slot="status" tone="success" appearance="outlined" size="lg" dot>Open until 11 pm</basic-badge>',
            );
            expect(source).toContain('<basic-select slot="locale"');
            expect(source).toContain('<basic-option value="en">🇬🇧 English</basic-option>');
            expect(source).toContain('<basic-option value="fr">🇫🇷 Français</basic-option>');
            if (file === "index.html") {
                expect(source).toContain('menu-style="plain"');
                expect(source.match(/<basic-menu\b/g)).toHaveLength(1);
                expect(source).toContain('<basic-button slot="trigger" tone="neutral" appearance="ghost">');
                expect(source).toContain('<button type="button">Menu</button>');
                expect(source).toContain('<svg slot="icon-end" viewBox="0 0 24 24"');
                expect(source).toContain('stroke="currentColor"');
                expect(source).toContain(
                    '<img slot="brand" src="/.cms/files/restaurant/passionne-logo.png" alt="Passionné"',
                );
                expect(source).toContain('<h1 slot="title">Contemporary French cuisine</h1>');
                expect(source).not.toContain('<h1 slot="brand">');
                expect(source).not.toContain('height="screen"');
                expect(source).not.toContain("emblem=");
                expect(source).not.toContain("mobile-image-fit=");
                expect(source).not.toContain("<restaurant-menu");
            } else {
                expect(source.match(/<restaurant-menu\b/g)).toHaveLength(1);
                expect(source).toContain('<button slot="menu" type="button">Menu</button>');
            }
            expect(source).not.toContain("<script");
            expect(source).not.toContain("fetch(");
            expect(source).not.toContain("cms-source");

            for (const href of source.matchAll(/href="([^"]+)"/g)) {
                expect(routes.has(href[1] ?? "")).toBe(true);
            }
            for (const image of source.matchAll(/src="([^"]+)"/g)) {
                const path = image[1] ?? "";
                expect(path.startsWith("/.cms/files/restaurant/")).toBe(true);
                await access(join(SITE, "files", path.slice("/.cms/files/".length)));
            }
        }
    });

    test("keeps media local and accessible", async () => {
        const assets = [
            "black-bowl.png",
            "colorful-dish.png",
            "menu.svg",
            "minimal-plate.png",
            "passionne-logo.png",
            "signature-dish.png",
        ];
        const registry = (await json(".cms-files-registry.json")) as {
            byPath: Record<string, string>;
        };

        expect(Object.keys(registry.byPath).sort()).toEqual([
            "restaurant",
            ...assets.map((asset) => `restaurant/${asset}`),
        ]);
        for (const asset of assets) {
            const source = await readFile(join(SITE, "files/restaurant", asset));
            if (asset.endsWith(".svg")) {
                expect(source.toString()).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
            } else {
                expect([...source.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
            }
        }
    });

    test("keeps full-screen demos flush with the viewport", async () => {
        const theme = await readFile(join(SITE, "theme.css"), "utf8");

        expect(theme).toContain("margin: 0");
        expect(theme).toContain("overflow-x: hidden");
    });
});

async function json(path: string): Promise<unknown> {
    return JSON.parse(await readFile(join(SITE, path), "utf8"));
}
