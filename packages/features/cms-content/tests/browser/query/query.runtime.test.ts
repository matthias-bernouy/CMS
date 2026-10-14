import { afterEach, expect, test } from "bun:test";
import { Query } from "../../../src/browser/binding/runtime/query/Query";
import { queryRequest } from "../../../src/browser/binding/runtime/query/queryRequest";
import { readSourceData } from "../../../src/browser/binding/source/values";
import { el, resetDom, waitFor } from "../support/testUtils";

afterEach(resetDom);

test("a Provider query maps its logical target to the private gateway transport", () => {
    const query = el(`<section
        cms-query="ulvia.cms.pages:list as pages"
        cms-query-input='{"limit":{"from":"raw","value":20}}'
    ></section>`);

    expect(queryRequest(query)).toEqual({
        url: "/.cms/call/ulvia.cms.pages/list",
        init: {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"limit":20}',
        },
    });
});

test("the closed Kernel query map does not expose arbitrary URLs", () => {
    const methods = el('<section cms-query="kernel.auth:methods as methods"></section>');
    expect(queryRequest(methods)).toEqual({ url: "/.cms/auth/methods", init: { method: "GET" } });

    const unknown = el('<section cms-query="kernel.auth:secrets as secrets"></section>');
    expect(() => queryRequest(unknown)).toThrow('Unknown Kernel query "kernel.auth:secrets"');
});

test("the alias owns the complete query state and data", async () => {
    const host = el(`<section cms-query="catalog.items:list as products">
        <p cms-condition="products.loading">Loading</p>
        <ul cms-condition="products.loaded">
            <li cms-repeat="products.data as product">{{ product.name }}</li>
        </ul>
    </section>`);
    document.body.appendChild(host);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const query = new Query(
        host,
        {},
        {
            request: async () => {
                await gate;
                return { kind: "success", data: [{ name: "Racket" }] };
            },
        },
    );

    query.start();
    expect(host.textContent).toContain("Loading");
    release();
    await waitFor(() => host.textContent?.includes("Racket") === true);
    expect(host.querySelector('[cms-condition="products.loading"]')).toBeNull();
    expect(readSourceData(host)).toEqual([{ name: "Racket" }]);
    query.dispose();
});

test("a refresh failure retains the previous data and exposes refreshError", async () => {
    const host = el(`<section cms-query="catalog.items:list as products">
        <p>{{ products.data.name }}</p>
        <span cms-condition="products.refreshError">Refresh failed</span>
    </section>`);
    document.body.appendChild(host);
    let calls = 0;
    const query = new Query(
        host,
        {},
        {
            request: async () => {
                calls += 1;
                return calls === 1
                    ? { kind: "success", data: { name: "Current" } }
                    : { kind: "error", status: 503, message: "Unavailable" };
            },
        },
    );

    query.start();
    await waitFor(() => host.textContent?.includes("Current") === true);
    expect(await query.run()).toBe(false);
    expect(host.textContent).toContain("Current");
    expect(host.textContent).toContain("Refresh failed");
    query.dispose();
});

test("a reload queued during an active query waits for a fresh result", async () => {
    const host = el('<section cms-query="catalog.items:list as products"></section>');
    document.body.appendChild(host);
    const releases: Array<() => void> = [];
    let calls = 0;
    const query = new Query(
        host,
        {},
        {
            request: async () => {
                calls += 1;
                await new Promise<void>((resolve) => releases.push(resolve));
                return { kind: "success", data: { calls } };
            },
        },
    );

    query.start();
    const reload = query.run();
    releases.shift()?.();
    await waitFor(() => calls === 2);
    releases.shift()?.();
    expect(await reload).toBe(true);
    expect(calls).toBe(2);
    query.dispose();
});
