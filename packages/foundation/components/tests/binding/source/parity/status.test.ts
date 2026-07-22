import { afterEach, describe, expect, test } from "bun:test";
import { Source } from "../../../../src/binding/source/Source";
import { el, resetDom, text } from "../../testUtils";
import { deferredJson, jsonSequence, responseSequence } from "./testUtils";

afterEach(resetDom);

describe("Source — parity contract for status/body transitions", () => {
    test("success, empty condition, error condition, and success can alternate on one source", async () => {
        responseSequence([
            { status: 200, body: JSON.stringify({ name: "Ada" }) },
            { status: 200, body: JSON.stringify([]) },
            { status: 200, body: JSON.stringify({ name: "Grace" }) },
            { status: 500, body: "failed" },
            { status: 200, body: JSON.stringify({ name: "Lin" }) },
        ]);
        const sourceElement = el(`
            <div cms-source="/x">
                <p class="data" cms-condition="$source.loaded">{{ name }}</p>
                <p cms-condition="$source.empty" class="empty">No rows</p>
                <p cms-condition="$source.error" class="error">Failed: {{ status }}</p>
            </div>
        `);
        const source = new Source(sourceElement);

        await source.run();
        expect(text(sourceElement.querySelector(".data"))).toBe("Ada");

        await source.run();
        expect(sourceElement.querySelector(".data")).toBeNull();
        expect(text(sourceElement.querySelector(".empty"))).toBe("No rows");

        await source.run();
        expect(sourceElement.querySelector(".empty")).toBeNull();
        expect(text(sourceElement.querySelector(".data"))).toBe("Grace");

        await source.run();
        expect(sourceElement.querySelector(".data")).toBeNull();
        expect(text(sourceElement.querySelector(".error"))).toBe("Failed: 500");

        await source.run();
        expect(sourceElement.querySelector(".error")).toBeNull();
        expect(text(sourceElement.querySelector(".data"))).toBe("Lin");
    });

    test("loading condition can replace an already-rendered body and then return to body", async () => {
        jsonSequence([{ name: "Ada" }]);
        const sourceElement = el(`
            <div cms-source="/x">
                <p class="data" cms-condition="$source.loaded">{{ name }}</p>
                <p cms-condition="$source.loading" class="loading">Loading</p>
            </div>
        `);
        const source = new Source(sourceElement);

        await source.run();
        expect(text(sourceElement.querySelector(".data"))).toBe("Ada");

        const release = deferredJson({ name: "Grace" });
        const pending = source.run();
        expect(sourceElement.querySelector(".data")).toBeNull();
        expect(text(sourceElement.querySelector(".loading"))).toBe("Loading");

        release();
        await pending;
        expect(sourceElement.querySelector(".loading")).toBeNull();
        expect(text(sourceElement.querySelector(".data"))).toBe("Grace");
    });
});
