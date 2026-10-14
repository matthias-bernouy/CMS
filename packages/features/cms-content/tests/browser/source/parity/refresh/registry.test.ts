import { afterEach, expect, test } from "bun:test";
import {
    connectQueryReload,
    connectSourceReload,
    reloadSource,
    submissionReload,
} from "../../../../../src/browser/binding/source/runtime/refresh/registry";
import { resetDom } from "../../../support/testUtils";

afterEach(resetDom);

function setup() {
    const isolated = document;
    isolated.body.innerHTML =
        '<cms-binding-core cms-binding-disabled><section cms-query="catalog:get as detail"></section><section cms-query="catalog:list as catalogue"></section><form cms-source="/save" cms-source-trigger="submit" cms-source-success-reload="detail"></form></cms-binding-core>';
    const source = isolated.querySelector("section")!;
    const catalogue = isolated.querySelectorAll("section")[1]!;
    const form = isolated.querySelector("form")!;
    const state = { calls: [] as string[] };
    const stop = connectQueryReload(
        source,
        () => source.getAttribute("cms-query") ?? "",
        async () => {
            state.calls.push("detail");
            return true;
        },
    );
    const stopCatalogue = connectQueryReload(
        catalogue,
        () => catalogue.getAttribute("cms-query") ?? "",
        async () => {
            state.calls.push("catalogue");
            return true;
        },
    );
    return { source, catalogue, form, state, stop, stopCatalogue };
}

test("reload targets one active read source and rejects replaced or changed selections", async () => {
    const { source, form, state, stop } = setup();
    expect(await reloadSource(source)).toBe(true);
    const operation = submissionReload(form)!;
    source.setAttribute("cms-query", "catalog:get as replacement");
    expect(await operation.reload()).toBe(false);
    source.setAttribute("cms-query", "catalog:get as detail");
    stop();
    expect(await operation.reload()).toBe(false);
    expect(state.calls).toEqual(["detail"]);
    await expect(reloadSource(source)).rejects.toThrow("active");
});

test("one successful submission can reload a bounded set of unique queries", async () => {
    const { form, state } = setup();
    form.setAttribute("cms-source-success-reload", "detail catalogue");
    const operation = submissionReload(form)!;
    expect(await operation.reload()).toBe(true);
    expect(state.calls).toEqual(["detail", "catalogue"]);
});

test("a disposed registration cannot remove its replacement", async () => {
    const { source, stop } = setup();
    connectSourceReload(source, { url: () => "/other", generation: () => 1, reload: async () => true });
    stop();
    expect(await reloadSource(source)).toBe(true);
});

test("query names cannot cross cores or match duplicates", () => {
    const { source, form } = setup();
    form.setAttribute("cms-source-success-reload", "bad-name");
    expect(() => submissionReload(form)).toThrow("queries by name");
    form.setAttribute("cms-source-success-reload", "detail detail");
    expect(() => submissionReload(form)).toThrow("queries by name");
    form.setAttribute("cms-source-success-reload", "section");
    expect(() => submissionReload(form)).toThrow("one active query");
    form.setAttribute("cms-source-success-reload", "detail");
    source.parentElement!.append(source.cloneNode(true));
    expect(() => submissionReload(form)).toThrow("one active");
    source.nextElementSibling?.nextElementSibling?.remove();
    const nested = source.ownerDocument.createElement("cms-binding-core");
    nested.setAttribute("cms-binding-disabled", "");
    source.parentElement!.append(nested);
    nested.append(source);
    expect(() => submissionReload(form)).toThrow("one active");
});
