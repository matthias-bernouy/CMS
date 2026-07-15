import { afterEach, describe, expect, test } from "bun:test";

import {
    Composition,
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    clearCompositionRuntimeState,
} from "../src/base";
import { BindingCore, BINDING_CORE_TAG } from "../src/binding/bindingCore";

class TestComposition extends Composition {
    constructor() {
        super({ template: `<section data-rendered><p>Generated</p></section>` });
    }
}

if (!customElements.get("test-composition")) {
    customElements.define("test-composition", TestComposition);
}
if (!customElements.get(BINDING_CORE_TAG)) {
    customElements.define(BINDING_CORE_TAG, BindingCore);
}

class BoundComposition extends Composition {
    constructor() {
        super({ template: `<p data-bound>{{ name }}</p>` });
    }
}

if (!customElements.get("bound-composition")) {
    customElements.define("bound-composition", BoundComposition);
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const realFetch = globalThis.fetch;

afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = realFetch;
});

describe("Composition", () => {
    test("renders its template directly in the Light DOM", () => {
        const composition = document.createElement("test-composition");
        document.body.append(composition);

        expect(composition.shadowRoot).toBeNull();
        expect(composition.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)).toBe(true);
        expect(composition.querySelector("[data-rendered]")?.textContent).toBe("Generated");
    });

    test("keeps authored children inert and hides later unprojected children", async () => {
        const composition = document.createElement("test-composition");
        composition.innerHTML = `<p data-authored>Authored</p>`;
        document.body.append(composition);

        expect(composition.querySelector("[data-authored]")).toBeNull();
        expect(inputOf(composition).content.querySelector("[data-authored]")).not.toBeNull();

        const late = document.createElement("button");
        late.dataset.late = "";
        composition.append(late);
        await flush();

        expect(inputOf(composition).content.querySelector("[data-late]")).toBeNull();
        expect(getComputedStyle(late).display).toBe("none");
        expect(late.hasAttribute(COMPOSITION_OUTPUT_ATTRIBUTE)).toBe(false);
    });

    test("restores only authored content before serialization", () => {
        const root = document.createElement("main");
        const composition = document.createElement("test-composition");
        composition.innerHTML = `<p data-authored>Authored</p>`;
        root.append(composition);
        document.body.append(root);

        const saved = root.cloneNode(true) as HTMLElement;
        clearCompositionRuntimeState(saved);
        const restored = saved.querySelector("test-composition")!;

        expect(restored.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)).toBe(false);
        expect(restored.querySelector(`[${COMPOSITION_INPUT_ATTRIBUTE}]`)).toBeNull();
        expect(restored.querySelector("[data-rendered]")).toBeNull();
        expect(restored.querySelector("[data-authored]")?.textContent).toBe("Authored");
    });

    test("does not duplicate generated content after reconnecting", () => {
        const composition = document.createElement("test-composition");
        document.body.append(composition);
        composition.remove();
        document.body.append(composition);

        expect(composition.querySelectorAll("[data-rendered]")).toHaveLength(1);
    });

    test("keeps binding references valid when cloned by a parent source", async () => {
        globalThis.fetch = (async () => Response.json({ name: "Ada" })) as unknown as typeof fetch;
        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <section cms-source="/profile">
                    <bound-composition></bound-composition>
                </section>
            </${BINDING_CORE_TAG}>
        `;

        await waitFor(() => document.querySelector("[data-bound]")?.textContent === "Ada");

        expect(document.querySelector("[data-bound]")?.textContent).toBe("Ada");
    });
});

function inputOf(composition: Element): HTMLTemplateElement {
    return composition.querySelector(`template[${COMPOSITION_INPUT_ATTRIBUTE}]`)!;
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (predicate()) return;
        await flush();
    }
    throw new Error("Timed out waiting for composition binding");
}
