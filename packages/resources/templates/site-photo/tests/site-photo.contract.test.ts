import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hardenStoredHtml } from "@bernouy/cms-content";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";
import { SITE_PHOTO_TEMPLATE_ROOT, SITE_PHOTO_TEMPLATE_SITE_ROOT } from "../../index";

const readSiteFile = (path: string): string => readFileSync(join(SITE_PHOTO_TEMPLATE_SITE_ROOT, path), "utf8");
const pageNames = readdirSync(join(SITE_PHOTO_TEMPLATE_SITE_ROOT, "pages"), { recursive: true })
    .filter((name) => name.endsWith(".html"))
    .sort();
const pageBodies = pageNames.map((name) => readSiteFile(`pages/${name}`));

describe("site-photo template contract", () => {
    test("is a portable P9R project with French authored content", () => {
        expect(JSON.parse(readFileSync(join(SITE_PHOTO_TEMPLATE_ROOT, "p9r.config.json"), "utf8"))).toEqual({
            siteDir: "site",
        });

        const system = JSON.parse(readSiteFile("system.json"));
        expect(system.site).toMatchObject({
            name: "Stillroom — Studio photographique",
            visible: true,
            host: "",
            language: "fr-FR",
            notFound: { path: "/404" },
        });
        expect(JSON.stringify(system)).not.toMatch(/token|secret|password|supabase\.co/i);
    });

    test("contains the complete shared site shell", () => {
        expect(pageNames).toEqual([
            "404.html",
            "a-propos.html",
            "albums.html",
            "contact.html",
            "index.html",
            "informations/confidentialite.html",
            "informations/cookies.html",
            "informations/mentions-legales.html",
            "photo-album.html",
        ]);

        for (const body of pageBodies) {
            expect(body).toStartWith("---\n");
            expect(body).toContain("<photo-site-shell>");
            expect(body).toContain('<photo-site-header slot="header">');
            expect(body).toContain('<photo-site-footer slot="footer">');
            expect(body).not.toMatch(/\s(?:class|style)=/u);
        }
    });

    test("imports compact, existing official integration releases", async () => {
        const names = readdirSync(join(SITE_PHOTO_TEMPLATE_SITE_ROOT, "integrations")).sort();
        expect(names).toEqual(["basic-blocs.json", "photo-albums.json"]);

        const imports = names.map((name) => JSON.parse(readSiteFile(`integrations/${name}`)));
        expect(imports).toEqual([
            { kind: "basic-blocs", version: "1.0.0", answers: {} },
            { kind: "photo-albums", version: "1.0.0", answers: { id: "photo-albums" } },
        ]);
        expect(imports.every((item) => item.definition === undefined)).toBeTrue();

        const official = new Set(
            (await buildOfficialIntegrationPackages()).map(({ kind, version }) => `${kind}@${version}`),
        );
        expect(imports.every(({ kind, version }) => official.has(`${kind}@${version}`))).toBeTrue();
    });

    test("keeps local layout Blocs source-backed and registration-free", () => {
        const groups = {
            Layout: ["photo-figure", "photo-hero", "photo-section"],
            Site: ["photo-site-footer", "photo-site-header", "photo-site-shell"],
        };

        for (const [group, tags] of Object.entries(groups)) {
            const root = join(SITE_PHOTO_TEMPLATE_SITE_ROOT, "blocs", group);
            expect(readdirSync(root).sort()).toEqual(tags);
            for (const tag of tags) {
                const blocRoot = join(root, tag);
                const manifest = JSON.parse(readFileSync(join(blocRoot, "manifest.json"), "utf8"));
                expect(manifest["default-tag"]).toBe(tag);
                expect(manifest).toMatchObject({ bloc: "./Bloc.ts", editor: "./BlocEditor.ts" });
                expect(readFileSync(join(blocRoot, "Bloc.ts"), "utf8")).not.toContain("customElements.define");
                expect(readFileSync(join(blocRoot, "BlocEditor.ts"), "utf8")).not.toContain("registerEditor");
                expect(readFileSync(join(blocRoot, "template.html"), "utf8")).not.toMatch(/\sclass=/u);
            }
        }
    });

    test("uses editable basic Blocs instead of page-specific CSS hooks", () => {
        const editableNativeTags = new Set(["a", "h1", "h2", "h3", "img", "li", "nav", "p", "span", "ul"]);
        for (const body of pageBodies) {
            const tags = [...body.matchAll(/<([a-z][a-z0-9-]*)\b/gu)].map((match) => match[1]);
            for (const tag of tags) {
                expect(editableNativeTags.has(tag) || tag.startsWith("basic-") || tag.startsWith("photo-")).toBeTrue();
            }
        }

        const theme = readSiteFile("theme.css");
        expect(theme).not.toMatch(/^\s*\.[-_a-z]/imu);
        expect(theme).not.toContain("photo-shell");
    });

    test("preserves CMS bindings through stored-page hardening", () => {
        for (const name of ["index.html", "albums.html", "photo-album.html"]) {
            const page = readSiteFile(`pages/${name}`);
            const content = page.replace(/^---\n[\s\S]*?\n---\n/u, "");
            const hardened = hardenStoredHtml(content);
            for (const marker of ["cms-condition", "data-source-width", "data-source-height"]) {
                expect(hardened).toContain(marker);
            }
        }
    });

    test("tracks only the two template media assets", () => {
        const registry = JSON.parse(readSiteFile(".cms-files-registry.json"));
        const paths = Object.keys(registry.byPath).sort();
        expect(paths).toEqual(["template", "template/coastal-dawn.jpg", "template/studio-placeholder.svg"]);
        for (const path of paths.filter((path) => path.includes("."))) {
            expect(existsSync(join(SITE_PHOTO_TEMPLATE_SITE_ROOT, "files", path))).toBeTrue();
        }
    });
});
