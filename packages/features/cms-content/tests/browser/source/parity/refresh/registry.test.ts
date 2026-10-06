import { afterEach, expect, test } from "bun:test";
import {
    connectSourceReload,
    reloadSource,
    submissionReload,
} from "../../../../../src/browser/binding/source/runtime/refresh/registry";
import { resetDom } from "../../../support/testUtils";

afterEach(resetDom);

function setup() {
    const isolated = document;
    isolated.body.innerHTML =
        '<cms-binding-core cms-binding-disabled><section id="detail" cms-source="/record"></section><form cms-source="/save" cms-source-trigger="submit" cms-source-success-reload="#detail"></form></cms-binding-core>';
    const source = isolated.querySelector("section")!;
    const form = isolated.querySelector("form")!;
    const state = { url: "/record?id=1", generation: 1, calls: 0 };
    const stop = connectSourceReload(source, {
        url: () => state.url,
        generation: () => state.generation,
        reload: async () => {
            state.calls++;
            return true;
        },
    });
    return { source, form, state, stop };
}

test("reload targets one active read source and rejects replaced or changed selections", async () => {
    const { source, form, state, stop } = setup();
    expect(await reloadSource(source)).toBe(true);
    const operation = submissionReload(form)!;
    state.url = "/record?id=2";
    expect(await operation.reload()).toBe(false);
    state.url = "/record?id=1";
    state.generation++;
    expect(await operation.reload()).toBe(false);
    stop();
    expect(await operation.reload()).toBe(false);
    expect(state.calls).toBe(1);
    await expect(reloadSource(source)).rejects.toThrow("active");
});

test("a disposed registration cannot remove its replacement", async () => {
    const { source, stop } = setup();
    connectSourceReload(source, { url: () => "/other", generation: () => 1, reload: async () => true });
    stop();
    expect(await reloadSource(source)).toBe(true);
});

test("selectors cannot cross cores, match duplicates, or target a submit source", () => {
    const { source, form } = setup();
    form.setAttribute("cms-source-success-reload", "section");
    expect(() => submissionReload(form)).toThrow("#id");
    form.setAttribute("cms-source-success-reload", "#detail");
    source.parentElement!.append(source.cloneNode(true));
    expect(() => submissionReload(form)).toThrow("one active");
    source.nextElementSibling?.nextElementSibling?.remove();
    source.setAttribute("cms-source-trigger", "submit");
    expect(() => submissionReload(form)).toThrow("one active");
    source.removeAttribute("cms-source-trigger");
    const nested = source.ownerDocument.createElement("cms-binding-core");
    nested.setAttribute("cms-binding-disabled", "");
    source.parentElement!.append(nested);
    nested.append(source);
    expect(() => submissionReload(form)).toThrow("one active");
});
