import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hardenStoredHtml } from "@bernouy/cms-content";
import {
    buildOfficialIntegrationPackages,
    loadOfficialIntegrationVerificationBackfill,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";
import { CMS_REPOSITORY_HUB_ROOT, CMS_REPOSITORY_HUB_SITE_ROOT } from "../index";

const readSiteFile = (path: string): string => readFileSync(join(CMS_REPOSITORY_HUB_SITE_ROOT, path), "utf8");
const homePage = readSiteFile("pages/index.html");
const integrationsPage = readSiteFile("pages/integrations.html");
const localBlocRoot = join(CMS_REPOSITORY_HUB_SITE_ROOT, "blocs", "Repository");

describe("cms-repository-hub resource", () => {
    test("is a regular p9r site without deployment-specific configuration", () => {
        expect(JSON.parse(readFileSync(join(CMS_REPOSITORY_HUB_ROOT, "p9r.config.json"), "utf8"))).toEqual({
            siteDir: "site",
        });

        const system = JSON.parse(readSiteFile("system.json"));
        expect(system.site).toEqual({
            name: "CmsCore Integration Repository",
            visible: true,
            language: "en",
        });
        expect(JSON.stringify(system)).not.toMatch(/https?:\/\/|token|secret|password/i);
    });

    test("imports only the existing official Bloc integrations", () => {
        const files = readdirSync(join(CMS_REPOSITORY_HUB_SITE_ROOT, "integrations")).sort();
        expect(files).toEqual(["basic-blocs.json", "documentation-blocs.json"]);
        const imports = files.map((file) => JSON.parse(readSiteFile(`integrations/${file}`)));

        expect(imports).toEqual([
            { kind: "basic-blocs", version: "1.0.0", answers: {} },
            { kind: "documentation-blocs", version: "1.0.0", answers: {} },
        ]);
        for (const integration of imports) {
            expect(integration.definition).toBeUndefined();
        }
    });

    test("identifies every pinned release that must be published after the historical bootstrap", async () => {
        const imports = readdirSync(join(CMS_REPOSITORY_HUB_SITE_ROOT, "integrations"))
            .sort()
            .map((file) => JSON.parse(readSiteFile(`integrations/${file}`)) as { kind: string; version: string });
        const packages = await buildOfficialIntegrationPackages();
        const packageIdentities = new Set(packages.map(({ kind, version }) => `${kind}@${version}`));
        const backfill = await loadOfficialIntegrationVerificationBackfill();
        const historicalIdentities = new Set(
            selectOfficialVerificationBackfillPackages(packages, backfill.index).map(
                ({ kind, version }) => `${kind}@${version}`,
            ),
        );
        const pinnedIdentities = imports.map(({ kind, version }) => `${kind}@${version}`);

        expect(pinnedIdentities.every((identity) => packageIdentities.has(identity))).toBeTrue();
        expect(pinnedIdentities.filter((identity) => !historicalIdentities.has(identity))).toEqual([
            "documentation-blocs@1.0.0",
        ]);
    });

    test("owns repository presentation in local Blocs instead of theme.css", () => {
        expect(existsSync(join(CMS_REPOSITORY_HUB_SITE_ROOT, "theme.css"))).toBeFalse();
        const tags = readdirSync(localBlocRoot).sort();
        expect(tags).toEqual(["repository-heading", "repository-page-shell", "repository-prose"]);

        for (const tag of tags) {
            const root = join(localBlocRoot, tag);
            const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
            expect(manifest["default-tag"]).toBe(tag);
            expect(manifest).toMatchObject({ bloc: "./Bloc.ts", editor: "./BlocEditor.ts" });
            expect(readFileSync(join(root, "Bloc.ts"), "utf8")).not.toContain("customElements.define");
            expect(readFileSync(join(root, "style.css"), "utf8")).not.toMatch(/(^|[\s,])(:root|html|body)\b/m);
        }
        expect(`${homePage}\n${integrationsPage}`).not.toContain('class="');
    });

    test("keeps the catalog in one same-origin declarative source", () => {
        const sourceBindings = integrationsPage.match(/cms-source="[^"]+"/g) ?? [];
        expect(sourceBindings).toEqual([
            'cms-source="/.cms/repository/api/integrations/catalog?q=#{q}&amp;category=#{category}&amp;provider=#{provider}&amp;compatibility=#{compatibility}&amp;kind=#{kind}&amp;version=#{version} as catalog"',
        ]);
        expect(`${homePage}\n${integrationsPage}`).not.toMatch(/<script\b|\bfetch\s*\(|https?:\/\//i);
    });

    test("survives the CMS stored-page sanitizer with its bindings intact", () => {
        const content = integrationsPage.replace(/^---\n[\s\S]*?\n---\n/u, "");
        const hardened = hardenStoredHtml(content);

        for (const binding of ["cms-source", "cms-repeat", "cms-condition", "cms-param-sync", "| innerHTML"]) {
            expect(hardened).toContain(binding);
        }
        expect(hardened).not.toMatch(/<script\b|\son[a-z]+=/i);
    });

    test("uses query parameters for every public catalog state", () => {
        for (const name of ["q", "category", "provider", "compatibility"]) {
            expect(integrationsPage).toContain(`cms-param-sync="${name}"`);
        }
        for (const name of ["q", "category", "provider", "compatibility", "kind", "version"]) {
            expect(integrationsPage).toContain(`#{${name}}`);
        }
        expect(integrationsPage).toContain("{{ integration.detailsUrl }}");
        expect(integrationsPage).toContain("{{ item.detailsUrl }}");
        expect(integrationsPage).toContain("{{ catalog.integrationUrl }}");
    });

    test("renders all catalog views and explicit source states", () => {
        expect(integrationsPage).toContain("catalog.schema == 'cms.repository.catalog.v1'");
        expect(integrationsPage).toContain("catalog.schema != 'cms.repository.catalog.v1'");
        for (const view of ["list", "integration", "version"]) {
            expect(integrationsPage).toContain(`catalog.view == '${view}'`);
        }
        for (const state of ["$source.loading", "$source.error", "$source.loaded"]) {
            expect(integrationsPage).toContain(state);
        }
        expect(integrationsPage).toContain('cms-repeat="catalog.integrations as integration"');
        expect(integrationsPage).toContain('cms-repeat="catalog.versions as item"');
        expect(integrationsPage).toContain("{{ catalog.downloadUrl }}");
        expect(integrationsPage).toContain("{{ catalog.featuredVersion.detailsUrl }}");
        expect(integrationsPage).toContain("{{ catalog.releaseNotesDownloadUrl }}");
    });

    test("uses only imported official and repository-local custom elements", () => {
        const customTags = new Set(
            [...`${homePage}\n${integrationsPage}`.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]+)/g)].map((match) => match[1]),
        );
        expect([...customTags].sort()).toEqual([
            "basic-alert",
            "basic-badge",
            "basic-button",
            "basic-card",
            "basic-container",
            "basic-grid",
            "basic-input",
            "basic-option",
            "basic-select",
            "basic-skeleton",
            "basic-stack",
            "doc-breadcrumb",
            "repository-heading",
            "repository-page-shell",
            "repository-prose",
        ]);
    });

    test("limits trusted HTML insertion to server-sanitized Markdown projections", () => {
        const rawHtmlPaths = [...integrationsPage.matchAll(/\{\{\s*([\w.-]+)\s*\|\s*innerHTML\s*\}\}/g)].map(
            (match) => match[1],
        );
        expect(rawHtmlPaths).toEqual(["instruction.html", "catalog.releaseNotesHtml"]);
    });
});
