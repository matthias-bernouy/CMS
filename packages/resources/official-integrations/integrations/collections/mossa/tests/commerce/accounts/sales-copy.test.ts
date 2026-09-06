import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

async function salesFixture(tag: string): Promise<{ controller: HTMLElement; markup: string }> {
    const root = resolve(
        OFFICIAL_INTEGRATIONS_ROOT,
        "collections/mossa/blocs/domains/commerce/accounts/commerce-account-sales",
    );
    const compiled = await prepare_bloc(
        new File([await Bun.file(resolve(root, "controller/Bloc.ts")).text()], "Bloc.ts"),
        null,
        "Sales",
        "Account",
        "",
        tag,
    );
    Object.assign(((window as Window & { p9r?: Record<string, unknown> }).p9r ??= {}), { Component });
    new Function(compiled.viewJS)();
    const template = document.createElement("template");
    template.innerHTML = await Bun.file(resolve(root, "template.html")).text();
    const controller = document.createElement(tag);
    controller.innerHTML = template.content.firstElementChild!.innerHTML;
    return { controller, markup: controller.innerHTML };
}

test("sales failures retain authored copy after source rendering and attribute changes", async () => {
    const { controller, markup } = await salesFixture("mossa-sales-copy-test");
    controller.setAttribute("error-message", "Sales history is unavailable");
    document.body.append(controller);
    try {
        expect(controller.querySelector("[data-sales-error]")?.textContent).toBe("Sales history is unavailable");
        controller.innerHTML = markup;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(controller.querySelector("[data-sales-error]")?.textContent).toBe("Sales history is unavailable");
        controller.removeAttribute("error-message");
        expect(controller.querySelector("[data-sales-error]")?.textContent).toBe(
            "Sales could not be loaded. Try again shortly.",
        );
    } finally {
        controller.remove();
    }
});

test("sales copy survives populated source replacement without changing sale data or pagination", async () => {
    const { controller, markup } = await salesFixture("mossa-sales-populated-copy-test");
    const attributes = {
        "status-label": "Choose a sales status",
        "label-all": "Every sale",
        "label-active": "Prepare shipment",
        "sold-on-label": "Purchased on",
        "items-label": "products",
        "loading-label": "Preparing sales",
        "empty-title": "No orders received",
        "empty-message": "New sales appear here",
        "pagination-previous-label": "Earlier",
        "pagination-next-label": "Later",
        "pagination-summary-template": "{page} / {pages}",
        "pagination-tone": "neutral",
        "sale-url": "/sale?id={saleId}",
        "sale-action-label": "Open sale",
    };
    for (const [name, value] of Object.entries(attributes)) {
        controller.setAttribute(name, value);
    }
    document.body.append(controller);
    try {
        controller.innerHTML = markup
            .replaceAll("{{ sale.id }}", "42")
            .replaceAll("{{ sale.createdAt }}", "2026-09-06");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(controller.querySelector("[data-pagination-reset]")?.getAttribute("accessible-label")).toBe(
            "Choose a sales status",
        );
        expect(controller.querySelector("[data-sales-loading]")?.getAttribute("label")).toBe("Preparing sales");
        for (const name of [
            "label-all",
            "label-active",
            "sold-on-label",
            "items-label",
            "empty-title",
            "empty-message",
        ] as const) {
            const matches = controller.querySelectorAll(`[data-copy="${name}"]`);
            expect(matches.length).toBeGreaterThan(0);
            for (const element of matches) {
                expect(element.textContent).toBe(attributes[name]);
            }
        }
        expect(controller.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-06");
        const link = controller.querySelector("[data-sale-link]");
        expect(link?.getAttribute("href")).toBe("/sale?id=42");
        expect(link?.textContent).toBe("Open sale");
        expect(link?.closest("mossa-button")?.getAttribute("tone")).toBe("neutral");
        const pagination = controller.querySelector("[data-pagination]");
        expect(pagination?.getAttribute("previous-label")).toBe("Earlier");
        expect(pagination?.getAttribute("next-label")).toBe("Later");
        expect(pagination?.getAttribute("summary-template")).toBe("{page} / {pages}");
        expect(pagination?.getAttribute("tone")).toBe("neutral");
        controller.removeAttribute("label-active");
        for (const element of controller.querySelectorAll('[data-copy="label-active"]')) {
            expect(element.textContent).toBe("To ship");
        }
        controller.setAttribute("sold-on-label", "Ordered on");
        expect(controller.querySelector('[data-copy="sold-on-label"]')?.textContent).toBe("Ordered on");
    } finally {
        controller.remove();
    }
});
