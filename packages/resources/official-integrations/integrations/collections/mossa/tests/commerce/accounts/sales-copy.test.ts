import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

test("sales failures retain authored copy after source rendering and attribute changes", async () => {
    const root = resolve(
        OFFICIAL_INTEGRATIONS_ROOT,
        "collections/mossa/blocs/domains/commerce/accounts/commerce-account-sales",
    );
    const tag = "mossa-sales-copy-test";
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
    controller.setAttribute("error-message", "Sales history is unavailable");
    document.body.append(controller);
    try {
        expect(controller.querySelector("[data-sales-error]")?.textContent).toBe("Sales history is unavailable");
        controller.innerHTML = template.content.firstElementChild!.innerHTML;
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
