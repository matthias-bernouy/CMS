import { afterEach, describe, expect, test } from "bun:test";
import { Source } from "../../../../../src/browser/binding/source/Source";
import { el, resetDom, text } from "../../../support/testUtils";
import { deferredJson, jsonSequence, responseSequence } from "../testUtils";

afterEach(resetDom);

describe("Source — parity contract for status/body transitions", () => {
    test("success, empty, refresh failure, and recovery can alternate on one source", async () => {
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
                <p cms-condition="$source.refreshError" class="refresh-error">Refresh failed: {{ $source.status }}</p>
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

        const loaded = sourceElement.querySelector(".data");
        await source.run();
        expect(sourceElement.querySelector(".data") === loaded).toBe(true);
        expect(text(loaded)).toBe("Grace");
        expect(sourceElement.querySelector(".error")).toBeNull();
        expect(text(sourceElement.querySelector(".refresh-error"))).toBe("Refresh failed: 500");

        await source.run();
        expect(sourceElement.querySelector(".error")).toBeNull();
        expect(text(sourceElement.querySelector(".data"))).toBe("Lin");
        expect(sourceElement.querySelector(".refresh-error")).toBeNull();
    });

    test("a changed URL replaces loaded data with loading before the new body", async () => {
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
        sourceElement.setAttribute("cms-source", "/other");
        const pending = source.run();
        expect(sourceElement.querySelector(".data")).toBeNull();
        expect(text(sourceElement.querySelector(".loading"))).toBe("Loading");

        release();
        await pending;
        expect(sourceElement.querySelector(".loading")).toBeNull();
        expect(text(sourceElement.querySelector(".data"))).toBe("Grace");
    });
});

for (const value of [{ name: "Ada" }, []]) {
    test(`same-URL refresh retains ${Array.isArray(value) ? "empty" : "loaded"} nodes through failure and retry`, async () => {
        jsonSequence([value]);
        const host = el(`<div cms-source="/x">
            <p class="loaded" cms-condition="$source.loaded">{{ name }}</p>
            <p class="empty" cms-condition="$source.empty">No rows</p>
            <p class="loading" cms-condition="$source.loading">Loading</p>
            <p class="error" cms-condition="$source.error">Error</p>
            <p class="refreshing" cms-condition="$source.refreshing">Refreshing</p>
            <p class="refresh-error" cms-condition="$source.refreshError">Failed {{ $source.status }}</p>
        </div>`);
        const source = new Source(host);
        await source.run();
        const selector = Array.isArray(value) ? ".empty" : ".loaded";
        const retained = host.querySelector(selector)!;
        let release!: (response: Response) => void;
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => {
                release = resolve;
            })) as unknown as typeof fetch;
        const pending = source.run();
        expect(host.querySelector(selector) === retained).toBe(true);
        expect(text(host.querySelector(".refreshing"))).toBe("Refreshing");
        expect(host.querySelector(".loading")).toBeNull();
        release(new Response("Unavailable", { status: 503 }));
        await pending;
        expect(host.querySelector(selector) === retained).toBe(true);
        expect(host.querySelector(".refreshing")).toBeNull();
        expect(host.querySelector(".error")).toBeNull();
        expect(text(host.querySelector(".refresh-error"))).toBe("Failed 503");
        const retry = source.run();
        expect(host.querySelector(selector) === retained).toBe(true);
        expect(host.querySelector(".refresh-error")).toBeNull();
        expect(text(host.querySelector(".refreshing"))).toBe("Refreshing");
        release(Response.json(value));
        await retry;
        expect(host.querySelector(selector) === retained).toBe(true);
        expect(host.querySelector(".refreshing")).toBeNull();
        expect(host.querySelector(".refresh-error")).toBeNull();
    });
}
