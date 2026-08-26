import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
            host: "https://example.com",
            language: "en",
            notFound: { path: "/404" },
        });
        expect(system).not.toHaveProperty("theme");
        expect(JSON.stringify(system)).not.toMatch(/token|secret|password/iu);
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
        editableTags.add("site-layout");

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
            expect(body).toContain("<site-layout>");
            expect(body).toContain('role="main"');
            expect(body.match(/<h1\b/gu)).toHaveLength(1);
            expect(body).toContain("<basic-hero");
        }
    });

    test("keeps the UI-authored shared shell as a server-rendered composition", () => {
        const layoutRoot = join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, "blocs/Layout/site-layout");
        const template = readFileSync(join(layoutRoot, "template.html"), "utf8");
        const manifest = JSON.parse(readFileSync(join(layoutRoot, "manifest.json"), "utf8"));

        expect(existsSync(join(layoutRoot, "builder.json"))).toBeTrue();
        expect(existsSync(join(layoutRoot, "Bloc.ts"))).toBeFalse();
        expect(manifest).toMatchObject({ composition: "./template.html", editor: "./BlocEditor.ts" });
        expect(template.match(/<a\b[^>]+href=/gu)).toHaveLength(8);
        expect(template).toContain('<slot name="content"></slot>');
        expect(template).not.toContain('slot name="header-');
        expect(template).not.toContain('slot name="footer-');
    });

    test("publishes the configured not-found page without indexing it", () => {
        const page = readSiteFile("pages/404.html");

        expect(page).toContain("visible: true");
        expect(page).toContain('indexing: {"enabled":false}');
    });

    test("demonstrates the editable site section recipes", () => {
        for (const tag of [
            "basic-cta",
            "basic-faq",
            "basic-faq-item",
            "basic-feature-section",
            "basic-media-section",
        ]) {
            expect(pageBodies.some((body) => body.includes(`<${tag}`))).toBeTrue();
        }
    });

    test("uses semantic component recipes instead of per-instance colors", () => {
        const styledComponents = pageBodies
            .flatMap((body) => [
                ...body.matchAll(
                    /<basic-(?:badge|button|card|cta|faq|feature-section|hero|media-section|site-footer)\b[^>]*>/gu,
                ),
            ])
            .map(([tag]) => tag);
        const buttons = styledComponents.filter((tag) => tag.startsWith("<basic-button"));
        const cards = styledComponents.filter((tag) => tag.startsWith("<basic-card"));

        expect(buttons.length).toBeGreaterThan(0);
        expect(cards.length).toBeGreaterThan(0);
        expect(
            styledComponents.filter((tag) =>
                /\b(?:accent|background|border|close|muted-text|selected-background|selected-text|text)-color=/u.test(
                    tag,
                ),
            ),
        ).toEqual([]);
        expect(styledComponents.filter((tag) => /\b(?:color|variant)=/u.test(tag))).toEqual([]);
        expect(buttons).toContainEqual(expect.stringContaining('tone="primary"'));
        expect(buttons).toContainEqual(expect.stringContaining('tone="neutral"'));
        expect(styledComponents).toContainEqual(expect.stringContaining('appearance="filled"'));
        expect(styledComponents).toContainEqual(expect.stringContaining('appearance="soft"'));
        for (const card of cards) {
            const appearance = card.match(/\bappearance="([^"]+)"/u)?.[1] ?? "outlined";
            expect(["filled", "soft", "outlined", "ghost"]).toContain(appearance);
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
