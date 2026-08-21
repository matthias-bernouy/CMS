import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";

const DEFAULT_SITE_TEMPLATE_ROOT = join(import.meta.dir, "..");
const DEFAULT_SITE_TEMPLATE_SITE_ROOT = join(DEFAULT_SITE_TEMPLATE_ROOT, "site");
const readSiteFile = (path: string): string => readFileSync(join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, path), "utf8");
const pageNames = readdirSync(join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, "pages")).sort();
const pageBodies = pageNames.map((name) => readSiteFile(`pages/${name}`));

describe("default-site template contract", () => {
    test("is a portable minimal P9R project", () => {
        expect(JSON.parse(readFileSync(join(DEFAULT_SITE_TEMPLATE_ROOT, "p9r.config.json"), "utf8"))).toEqual({
            siteDir: "site",
        });
        expect(pageNames).toEqual(["404.html", "about.html", "contact.html", "index.html"]);

        const system = JSON.parse(readSiteFile("system.json"));
        expect(system.site).toMatchObject({
            name: "Morrow",
            visible: true,
            host: "",
            language: "en",
            notFound: { path: "/404" },
        });
        expect(system).not.toHaveProperty("theme");
        expect(JSON.stringify(system)).not.toMatch(/token|secret|password|https?:\/\//iu);
    });

    test("imports only the existing Basic Blocs release", async () => {
        expect(readdirSync(join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, "integrations"))).toEqual(["basic-blocs.json"]);
        expect(JSON.parse(readSiteFile("integrations/basic-blocs.json"))).toEqual({
            kind: "basic-blocs",
            version: "1.0.0",
            answers: {},
        });
        const official = await buildOfficialIntegrationPackages();
        expect(official.some(({ kind, version }) => kind === "basic-blocs" && version === "1.0.0")).toBeTrue();
    });

    test("uses only elements backed by installed Bloc editors", async () => {
        const official = await buildOfficialIntegrationPackages();
        const basic = official.find(({ kind, version }) => kind === "basic-blocs" && version === "1.0.0");
        const editableTags = new Set(
            basic?.definition.artifacts.flatMap((artifact) =>
                artifact.type === "bloc" && artifact.bloc.editorJS ? [artifact.bloc.tag] : [],
            ) ?? [],
        );

        for (const body of pageBodies) {
            const tags = [...body.matchAll(/<([a-z][a-z0-9-]*)(?:\s|>)/gu)].map((match) => match[1]!);
            expect(tags.length).toBeGreaterThan(0);
            expect([...new Set(tags)].filter((tag) => !editableTags.has(tag))).toEqual([]);
            expect(body).not.toMatch(/\b(?:class|style)=/iu);
        }
    });

    test("keeps a complete, accessible page shell", () => {
        for (const body of pageBodies) {
            expect(body).toStartWith("---\n");
            expect(body).toContain("<header");
            expect(body).toContain('role="main"');
            expect(body).toContain("<h1");
            expect(body).toContain("<footer");
        }
    });

    test("ships editable local media with stable CMS file ids", () => {
        const registry = JSON.parse(readSiteFile(".cms-files-registry.json"));
        const paths = ["template/hero-studio.webp", "template/project-coast.webp", "template/project-objects.webp"];

        for (const path of paths) {
            const id = registry.byPath[path];
            expect(id).toBeString();
            expect(registry.byId[id]).toMatchObject({ path });
            expect(
                readFileSync(join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, "files", path))
                    .subarray(0, 4)
                    .toString(),
            ).toBe("RIFF");
            expect(pageBodies.some((body) => body.includes(`/.cms/files/by-id/${id}`))).toBeTrue();
        }
    });
});
