import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const RESOURCES_ROOT = resolve(OFFICIAL_INTEGRATIONS_ROOT, "../..");

describe("native light-DOM navigation", () => {
    test("keeps cross-page navigation out of component shadow templates", () => {
        const findings: string[] = [];
        for (const file of integrationFiles("**/template.html")) {
            if (siblingManifest(file)?.composition) {
                continue;
            }
            const anchors = fragment(readFileSync(file, "utf8")).querySelectorAll('a[href]:not([href^="#"])');
            if (anchors.length > 0) {
                findings.push(`${show(file)}: ${anchors.length} persistent shadow navigation link(s)`);
            }
        }
        expect(findings).toEqual([]);
    });

    test("does not recreate a custom button link API at runtime", () => {
        const findings = integrationFiles("**/*.ts")
            .filter((file) => /setAttribute\(\s*["']action["']\s*,\s*["']link["']/u.test(readFileSync(file, "utf8")))
            .map(show)
            .sort();
        expect(findings).toEqual([]);
    });

    test("exposes repository pages to a shadow-unaware crawl", () => {
        for (const file of sitePages("sites/cms-repository-hub/site")) {
            expect(fragment(readFileSync(file, "utf8")).querySelectorAll("a[href]").length).toBeGreaterThan(0);
        }
    });
});

function integrationFiles(pattern: string): string[] {
    return glob(OFFICIAL_INTEGRATIONS_ROOT, pattern).filter((file) => !file.includes(`${sep}tests${sep}`));
}

function sitePages(scope: string): string[] {
    return glob(resolve(RESOURCES_ROOT, scope, "pages"), "**/*.html");
}

function glob(cwd: string, pattern: string): string[] {
    return Array.from(new Bun.Glob(pattern).scanSync({ cwd, absolute: true, onlyFiles: true }));
}

function fragment(source: string): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = source.replace(/^---\n[\s\S]*?\n---\n/u, "");
    return template.content;
}

function siblingManifest(template: string): { composition?: string } | null {
    const path = resolve(template, "../manifest.json");
    return Bun.file(path).size > 0 ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function show(file: string): string {
    return relative(RESOURCES_ROOT, file).replaceAll("\\", "/");
}
