import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const MOSSA_ROOT = resolve(OFFICIAL_INTEGRATIONS_ROOT, "collections/mossa");
const BUTTON_SEMANTIC_ATTRIBUTES = ["action", "href", "target", "rel", "type", "disabled", "name", "value"];

describe("Mossa native navigation", () => {
    test("applies pagination appearance to its visual wrappers and preserves native navigation", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        const artifact = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-pagination",
        );
        if (artifact?.type !== "bloc") {
            throw new Error("Pagination artifact missing");
        }
        const tag = "test-mossa-pagination-visual-controls";
        const bloc = artifact.bloc;
        const compiled = await prepare_bloc(
            new File([bloc.viewJS!], "Bloc.ts"),
            null,
            bloc.name,
            "Navigation",
            "",
            tag,
            bloc.source,
        );
        Object.assign(((window as Window & { p9r?: Record<string, unknown> }).p9r ??= {}), { Component });
        new Function(compiled.viewJS)();
        const pagination = document.createElement(tag);
        for (const [name, value] of Object.entries({
            "page-size": "10",
            total: "15",
            tone: "neutral",
            appearance: "ghost",
            "previous-label": "Back",
            "next-label": "Forward",
            "summary-template": "{page}/{pages}",
        })) {
            pagination.setAttribute(name, value);
        }
        document.body.append(pagination);
        try {
            const previous = pagination.shadowRoot!.querySelector<HTMLButtonElement>("[data-previous]")!;
            const next = pagination.shadowRoot!.querySelector<HTMLButtonElement>("[data-next]")!;
            for (const button of [previous, next]) {
                expect(button.closest("mossa-button")?.getAttribute("tone")).toBe("neutral");
                expect(button.closest("mossa-button")?.getAttribute("appearance")).toBe("ghost");
                expect(button.hasAttribute("tone")).toBeFalse();
            }
            expect(previous.disabled).toBeTrue();
            expect(next.disabled).toBeFalse();
            expect(previous.textContent).toBe("Back");
            expect(next.textContent).toBe("Forward");
            expect(pagination.shadowRoot!.querySelector("[data-summary]")?.textContent).toBe("1/2");
            let detail: unknown;
            pagination.addEventListener("mossa-pagination:change", (event) => {
                detail = (event as CustomEvent).detail;
            });
            next.click();
            expect(detail).toEqual({ page: 2, limit: 10, offset: 10 });
            expect(previous.disabled).toBeFalse();
            expect(next.disabled).toBeTrue();
            pagination.removeAttribute("tone");
            expect(next.closest("mossa-button")?.getAttribute("tone")).toBe("primary");
        } finally {
            pagination.remove();
        }
    });

    test("keeps authored HTML semantics on direct native controls", () => {
        const findings: string[] = [];
        for (const file of glob(MOSSA_ROOT, "**/*.html")) {
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

    test("keeps dynamic and technical anchor creation on an explicit allowlist", () => {
        const sources = integrationFiles("**/*.ts").filter((file) =>
            readFileSync(file, "utf8").includes('createElement("a")'),
        );
        expect(sources.map(show).sort()).toEqual([
            "blocs/domains/account/orders/purchases/Bloc.ts",
            "blocs/domains/commerce/checkout/commerce-stripe-payment/legal-consent.ts",
            "blocs/domains/commerce/checkout/service-withdrawal/Bloc.ts",
            "blocs/domains/commerce/fulfillment/commerce-mondial-relay-sale-fulfillment/Bloc.ts",
            "blocs/domains/commerce/offers/pricing/commerce-offer-price-form/controller/Bloc.ts",
        ]);
    });

    test("updates offer-price retry labels on the native button", () => {
        const controller = resolve(
            MOSSA_ROOT,
            "blocs/domains/commerce/offers/pricing/commerce-offer-price-form/controller/Bloc.ts",
        );
        const source = readFileSync(controller, "utf8");
        expect(source).toContain('return this.querySelector("[data-retry]");');
        expect(source).not.toContain('return this.querySelector("[data-technical-retry]");');
    });

    test("exposes repeated offer navigation to a shadow-unaware crawl", () => {
        const root = resolve(MOSSA_ROOT, "blocs/domains/commerce/offers/catalogue/commerce-offer-list");
        const anchor = fragment(readFileSync(resolve(root, "default.html"), "utf8")).querySelector<HTMLAnchorElement>(
            'mossa-commerce-offer-preview > a[slot="navigation"]',
        );
        expect(anchor?.hasAttribute("href")).toBe(false);
        expect(anchor?.getAttribute("aria-label")).toContain("{{ offer.title }}");

        const controller = readFileSync(resolve(root, "presentation.ts"), "utf8");
        expect(controller).toContain('host.getAttribute("offer-url")');
        expect(controller).toContain('setAttributeIfChanged(link, "href"');
    });

    test("keeps offer-card navigation above passive content and below sibling actions", () => {
        const root = resolve(MOSSA_ROOT, "blocs/domains/commerce/offers/catalogue/commerce-offer-preview");
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

function integrationFiles(pattern: string): string[] {
    return glob(MOSSA_ROOT, pattern).filter((file) => !file.includes(`${sep}tests${sep}`));
}

function glob(cwd: string, pattern: string): string[] {
    return Array.from(new Bun.Glob(pattern).scanSync({ cwd, absolute: true, onlyFiles: true }));
}

function fragment(source: string): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = source.replace(/^---\n[\s\S]*?\n---\n/u, "");
    return template.content;
}

function show(file: string): string {
    return relative(MOSSA_ROOT, file).replaceAll("\\", "/");
}
