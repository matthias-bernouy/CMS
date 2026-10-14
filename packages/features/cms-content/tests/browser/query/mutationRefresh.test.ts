import { afterEach, expect, test } from "bun:test";
import { connectQueryReload, formMutationReload } from "../../../src/browser/binding/runtime/query/mutationRefresh";
import { resetDom } from "../support/testUtils";

afterEach(resetDom);

function setup() {
    const isolated = document;
    isolated.body.innerHTML =
        '<cms-binding-core><section cms-query="catalog:get as detail"></section><section cms-query="catalog:list as catalogue"></section><form cms-source="/save" cms-source-trigger="submit" cms-source-success-reload="detail"></form></cms-binding-core>';
    const source = isolated.querySelector("section")!;
    const catalogue = isolated.querySelectorAll("section")[1]!;
    const form = isolated.querySelector("form")!;
    const state = { acknowledgements: [] as (HTMLFormElement | undefined)[], calls: [] as string[] };
    const stop = connectQueryReload(
        source,
        () => source.getAttribute("cms-query") ?? "",
        async (acknowledge) => {
            state.acknowledgements.push(acknowledge);
            state.calls.push("detail");
            return true;
        },
    );
    const stopCatalogue = connectQueryReload(
        catalogue,
        () => catalogue.getAttribute("cms-query") ?? "",
        async (acknowledge) => {
            state.acknowledgements.push(acknowledge);
            state.calls.push("catalogue");
            return true;
        },
    );
    return { source, catalogue, form, state, stop, stopCatalogue };
}

test("submission reload rejects replaced or disconnected query selections", async () => {
    const { source, form, state, stop } = setup();
    const operation = formMutationReload(form)!;
    source.setAttribute("cms-query", "catalog:get as replacement");
    expect(await operation.reload()).toBe(false);
    source.setAttribute("cms-query", "catalog:get as detail");
    stop();
    expect(await operation.reload()).toBe(false);
    expect(state.calls).toEqual([]);
});

test("one successful submission can reload a bounded set of unique queries", async () => {
    const { form, state } = setup();
    form.setAttribute("cms-source-success-reload", "detail catalogue");
    const operation = formMutationReload(form)!;
    expect(await operation.reload()).toBe(true);
    expect(state.calls).toEqual(["detail", "catalogue"]);
    expect(state.acknowledgements).toEqual([form, form]);
});

test("query names cannot cross cores or match duplicates", () => {
    const { source, form } = setup();
    form.setAttribute("cms-source-success-reload", "bad-name");
    expect(() => formMutationReload(form)).toThrow("queries by name");
    form.setAttribute("cms-source-success-reload", "detail detail");
    expect(() => formMutationReload(form)).toThrow("queries by name");
    form.setAttribute("cms-source-success-reload", "section");
    expect(() => formMutationReload(form)).toThrow("one active query");
    form.setAttribute("cms-source-success-reload", "detail");
    source.parentElement!.append(source.cloneNode(true));
    expect(() => formMutationReload(form)).toThrow("one active");
    source.nextElementSibling?.nextElementSibling?.remove();
    const nested = source.ownerDocument.createElement("cms-binding-core");
    source.parentElement!.append(nested);
    nested.append(source);
    expect(() => formMutationReload(form)).toThrow("one active");
});
