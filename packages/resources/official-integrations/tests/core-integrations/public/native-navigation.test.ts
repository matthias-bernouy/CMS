import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const RESOURCES_ROOT = resolve(OFFICIAL_INTEGRATIONS_ROOT, "../..");
const HTML_SCOPES = [OFFICIAL_INTEGRATIONS_ROOT, resolve(RESOURCES_ROOT, "sites/cms-repository-hub/site")];
const BUTTON_SEMANTIC_ATTRIBUTES = ["action", "href", "target", "rel", "type", "disabled", "name", "value"];

describe("native light-DOM navigation", () => {
    test("keeps authored HTML semantics on direct native controls", () => {
        const findings: string[] = [];
        for (const file of htmlFiles()) {
            const root = fragment(readFileSync(file, "utf8"));
            for (const host of root.querySelectorAll("mossa-button")) {
                if (host.closest("[data-forms-runtime-dependencies]")) {
                    continue;
                }
                const attributes = BUTTON_SEMANTIC_ATTRIBUTES.filter((name) => host.hasAttribute(name));
                if (attributes.length > 0) {
                    findings.push(`${show(file)}: mossa-button owns ${attributes.join(", ")}`);
                }
                const controls = Array.from(host.children).filter((child) => child.matches("a, button"));
                if (controls.length !== 1 || host.children.length !== 1) {
                    findings.push(`${show(file)}: mossa-button must contain exactly one direct native control`);
                }
            }
            for (const host of root.querySelectorAll("[href]")) {
                if (host.localName.includes("-")) {
                    findings.push(`${show(file)}: <${host.localName}> owns href`);
                }
            }
            for (const control of root.querySelectorAll("a, button")) {
                if (control.parentElement?.closest("a, button")) {
                    findings.push(`${show(file)}: nested interactive <${control.localName}>`);
                }
            }
            for (const anchor of root.querySelectorAll('a[target="_blank"]')) {
                const rel = new Set((anchor.getAttribute("rel") ?? "").split(/\s+/u));
                if (!rel.has("noopener")) {
                    findings.push(`${show(file)}: target=_blank link is missing rel=noopener`);
                }
            }
        }
        expect(findings).toEqual([]);
    });

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

    test("keeps dynamic and technical anchor creation on an explicit allowlist", () => {
        const sources = integrationFiles("**/*.ts").filter((file) =>
            readFileSync(file, "utf8").includes('createElement("a")'),
        );
        expect(sources.map(show).sort()).toEqual([
            "official-integrations/integrations/collections/mossa/blocs/domains/account/orders/purchases/Bloc.ts",
            "official-integrations/integrations/collections/mossa/blocs/domains/commerce/checkout/commerce-stripe-payment/legal-consent.ts",
            "official-integrations/integrations/collections/mossa/blocs/domains/commerce/checkout/service-withdrawal/Bloc.ts",
            "official-integrations/integrations/collections/mossa/blocs/domains/commerce/fulfillment/commerce-mondial-relay-sale-fulfillment/Bloc.ts",
            "official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/pricing/commerce-offer-price-form/controller/Bloc.ts",
        ]);
    });

    test("does not recreate a custom button link API at runtime", () => {
        const findings = integrationFiles("**/*.ts")
            .filter((file) => /setAttribute\(\s*["']action["']\s*,\s*["']link["']/u.test(readFileSync(file, "utf8")))
            .map(show)
            .sort();
        expect(findings).toEqual([]);
    });

    test("updates offer-price retry labels on the native button", () => {
        const controller = resolve(
            OFFICIAL_INTEGRATIONS_ROOT,
            "collections/mossa/blocs/domains/commerce/offers/pricing/commerce-offer-price-form/controller/Bloc.ts",
        );
        const source = readFileSync(controller, "utf8");
        expect(source).toContain('return this.querySelector("[data-retry]");');
        expect(source).not.toContain('return this.querySelector("[data-technical-retry]");');
    });

    test("exposes repository and repeated navigation to a shadow-unaware crawl", () => {
        for (const file of sitePages("sites/cms-repository-hub/site")) {
            expect(fragment(readFileSync(file, "utf8")).querySelectorAll("a[href]").length).toBeGreaterThan(0);
        }

        const list = resolve(
            OFFICIAL_INTEGRATIONS_ROOT,
            "collections/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-list/default.html",
        );
        const anchor = fragment(readFileSync(list, "utf8")).querySelector<HTMLAnchorElement>(
            'mossa-commerce-offer-preview > a[slot="navigation"]',
        );
        expect(anchor?.hasAttribute("href")).toBe(false);
        expect(anchor?.getAttribute("aria-label")).toContain("{{ offer.title }}");

        const controller = readFileSync(
            resolve(
                OFFICIAL_INTEGRATIONS_ROOT,
                "collections/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-list/presentation.ts",
            ),
            "utf8",
        );
        expect(controller).toContain('host.getAttribute("offer-url")');
        expect(controller).toContain('setAttributeIfChanged(link, "href"');
    });

    test("keeps offer-card navigation above passive content and below sibling actions", () => {
        const root = resolve(
            OFFICIAL_INTEGRATIONS_ROOT,
            "collections/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-preview",
        );
        const card = fragment(readFileSync(resolve(root, "default.html"), "utf8"));
        expect(card.querySelector('mossa-commerce-offer-preview > a[slot="navigation"][href]')).not.toBeNull();
        expect(
            card.querySelector('mossa-commerce-offer-preview > mossa-button[slot="action"] > a[href]'),
        ).not.toBeNull();

        const style = readFileSync(resolve(root, "style.css"), "utf8");
        const contentRule = style.match(/\[part="content"\]\s*\{([^}]*)\}/u)?.[1] ?? "";
        const actionsRule = style.match(/\[part="actions"\]\s*\{([^}]*)\}/u)?.[1] ?? "";
        expect(style).toContain('::slotted(a[slot="navigation"])');
        expect(contentRule).toContain("pointer-events: none");
        expect(contentRule).not.toContain("z-index");
        expect(actionsRule).toContain("z-index: 3");
        expect(actionsRule).toContain("pointer-events: auto");
    });
});

function htmlFiles(): string[] {
    return HTML_SCOPES.flatMap((root) => glob(root, "**/*.html"));
}

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
