import { afterEach, expect, test } from "bun:test";
import { Query } from "../../../src/browser/binding/runtime/query/Query";
import { queryRequest } from "../../../src/browser/binding/runtime/query/queryRequest";
import { readSyncValue, writeSyncValue } from "../../../src/browser/binding/state/SyncState";
import { el, resetDom, waitFor } from "../support/testUtils";

afterEach(resetDom);

test("a Provider query with input uses the logical QUERY transport", () => {
    const query = el(`<section
        cms-query="ulvia.cms.pages:list as pages"
        cms-query-input='{"limit":{"from":"literal","value":20}}'
    ></section>`);

    expect(queryRequest(query)).toEqual({
        url: "/.cms/query/ulvia.cms.pages/list",
        init: {
            method: "QUERY",
            headers: { "content-type": "application/json" },
            body: '{"limit":20}',
        },
        input: { limit: 20 },
    });
});

test("a Provider query input builds nested objects and arrays from typed paths", () => {
    location.href = "http://localhost/?site-repository=official&site-collection=ulvia&site-version=2.0.0";
    const query = el(`<section
        cms-query="ulvia.cms.collections:plan-migration as plan"
        cms-query-input='{
            "targets[0][repositoryId]":{"from":"state","key":"@param:site-repository"},
            "targets[0][collectionId]":{"from":"state","key":"@param:site-collection"},
            "targets[0][version]":{"from":"state","key":"@param:site-version"},
            "targets[0][publisherId]":{"from":"literal","value":"ulvia.official"}
        }'
    ></section>`);

    expect(queryRequest(query).init.body).toBe(
        '{"targets":[{"repositoryId":"official","collectionId":"ulvia","version":"2.0.0","publisherId":"ulvia.official"}]}',
    );
});

test("a Provider query omits absent optional query parameters", () => {
    location.href = "http://localhost/?site-collection=ulvia&site-theme-mode=";
    const query = el(`<section
        cms-query="ulvia.cms.theme:get as theme"
        cms-query-input='{
            "collectionId":{"from":"state","key":"@param:site-collection"},
            "profileId":{"from":"state","key":"@param:site-theme-profile","optional":true},
            "mode":{"from":"state","key":"@param:site-theme-mode","optional":true}
        }'
    ></section>`);

    expect(queryRequest(query).init.body).toBe('{"collectionId":"ulvia","mode":""}');
});

test("a Provider query selects and strictly casts synchronized state", () => {
    const target = { scope: "page", key: "ulvia-official-selection" } as const;
    writeSyncValue(target, { data: { product: { id: "42" } } });
    const query = el(`<section
        cms-query="catalog.items:get as product"
        cms-query-input='{
            "id":{"from":"state","key":"@page:ulvia-official-selection","path":["data","product","id"],"cast":"integer"},
            "locale":{"from":"state","key":"@param:site-locale","fallback":"en"}
        }'
    ></section>`);

    expect(queryRequest(query)).toMatchObject({ input: { id: 42, locale: "en" } });
    writeSyncValue(target, undefined);
});

test("a Provider query waits for required synchronized input", async () => {
    const target = { scope: "page", key: "ulvia-official-required-filter" } as const;
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-query-input='{"status":{"from":"state","key":"@page:ulvia-official-required-filter"}}'
        cms-query-listen="@page:ulvia-official-required-filter"
    ><p cms-condition="products.activity === 'waiting'">Waiting</p></section>`);
    document.body.appendChild(host);
    const inputs: unknown[] = [];
    const query = new Query(
        host,
        {},
        {
            request: async (_url, _signal, init) => {
                inputs.push(JSON.parse(String(init?.body)));
                return { kind: "success", data: [] };
            },
        },
    );

    query.start();
    expect(host.textContent).toContain("Waiting");
    expect(inputs).toEqual([]);
    writeSyncValue(target, "published");
    await waitFor(() => inputs.length === 1);
    expect(inputs).toEqual([{ status: "published" }]);
    query.dispose();
    writeSyncValue(target, undefined);
});

test("a Provider query without input uses the cache-compatible logical GET transport", () => {
    const query = el('<section cms-query="ulvia.cms.pages:list as pages"></section>');

    expect(queryRequest(query)).toEqual({
        url: "/.cms/query/ulvia.cms.pages/list",
        init: { method: "GET" },
    });
});

test("the closed Kernel query map does not expose arbitrary URLs", () => {
    const account = el('<section cms-query="kernel.auth:me as account"></section>');
    expect(queryRequest(account)).toEqual({ url: "/.cms/auth/me", init: { method: "GET" } });

    const methods = el('<section cms-query="kernel.auth:methods as methods"></section>');
    expect(queryRequest(methods)).toEqual({ url: "/.cms/auth/methods", init: { method: "GET" } });

    const unknown = el('<section cms-query="kernel.auth:secrets as secrets"></section>');
    expect(() => queryRequest(unknown)).toThrow('Unknown Kernel query "kernel.auth:secrets"');
});

test("the alias owns the complete query state and data", async () => {
    const host = el(`<section cms-query="catalog.items:list as products">
        <p cms-condition="products.activity === 'fetching'">Loading</p>
        <ul cms-condition="products.hasData">
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
    expect(host.querySelector("[cms-condition=\"products.activity === 'fetching'\"]")).toBeNull();
    query.dispose();
});

test("a remote query publishes its lifecycle and resolved input", async () => {
    const target = { scope: "page", key: "ulvia-official-products" } as const;
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-query-input='{"limit":{"from":"literal","value":20}}'
        cms-sync="@page:ulvia-official-products"
    ><p>{{ products.data[0].name }}</p></section>`);
    document.body.appendChild(host);
    const query = new Query(host, {}, { request: async () => ({ kind: "success", data: [{ name: "Racket" }] }) });

    query.start();
    await waitFor(() => host.textContent?.includes("Racket") === true);

    expect(readSyncValue(target)).toMatchObject({
        activity: "idle",
        hasData: true,
        outcome: { kind: "success", status: 200 },
        input: { limit: 20 },
        data: [{ name: "Racket" }],
    });
    query.dispose();
    writeSyncValue(target, undefined);
});

test("a remote query refreshes only when one of its synchronized inputs changes", async () => {
    const target = { scope: "page", key: "ulvia-official-filter" } as const;
    const unrelated = { scope: "page", key: "ulvia-official-unrelated" } as const;
    writeSyncValue(target, "draft");
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-query-input='{"status":{"from":"state","key":"@page:ulvia-official-filter"}}'
        cms-query-listen="@page:ulvia-official-filter"
    ></section>`);
    document.body.appendChild(host);
    const inputs: unknown[] = [];
    const query = new Query(
        host,
        {},
        {
            request: async (_url, _signal, init) => {
                inputs.push(JSON.parse(String(init?.body)));
                return { kind: "success", data: [] };
            },
        },
    );

    query.start();
    await waitFor(() => inputs.length === 1);
    writeSyncValue(unrelated, "ignored");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inputs).toHaveLength(1);

    writeSyncValue(target, "published");
    await waitFor(() => inputs.length === 2);
    expect(inputs).toEqual([{ status: "draft" }, { status: "published" }]);
    query.dispose();
    writeSyncValue(target, undefined);
    writeSyncValue(unrelated, undefined);
});

test("an explicit listener invalidates a remote query even when its selected input path is unchanged", async () => {
    const target = { scope: "page", key: "ulvia-official-selection-snapshot" } as const;
    writeSyncValue(target, { data: { id: "one" }, refreshing: false });
    const host = el(`<section
        cms-query="catalog.items:get as product"
        cms-query-input='{"id":{"from":"state","key":"@page:ulvia-official-selection-snapshot","path":["data","id"]}}'
        cms-query-listen="@page:ulvia-official-selection-snapshot"
    ></section>`);
    document.body.appendChild(host);
    const inputs: unknown[] = [];
    const query = new Query(
        host,
        {},
        {
            request: async (_url, _signal, init) => {
                inputs.push(JSON.parse(String(init?.body)));
                return { kind: "success", data: {} };
            },
        },
    );

    query.start();
    await waitFor(() => inputs.length === 1);
    writeSyncValue(target, { data: { id: "one" }, refreshing: true });
    await waitFor(() => inputs.length === 2);
    writeSyncValue(target, { data: { id: "two" }, refreshing: false });
    await waitFor(() => inputs.length === 3);
    expect(inputs).toEqual([{ id: "one" }, { id: "one" }, { id: "two" }]);
    query.dispose();
    writeSyncValue(target, undefined);
});

test("a projected listener reloads only when its selected JSON branch changes", async () => {
    const target = { scope: "page", key: "ulvia-official-save" } as const;
    writeSyncValue(target, { activity: "idle", lastSuccess: null });
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-query-listen="@page:ulvia-official-save/lastSuccess"
    ></section>`);
    document.body.appendChild(host);
    let requests = 0;
    const query = new Query(host, {}, { request: async () => ({ kind: "success", data: ++requests }) });

    query.start();
    await waitFor(() => requests === 1);
    writeSyncValue(target, { activity: "submitting", lastSuccess: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toBe(1);

    writeSyncValue(target, {
        activity: "idle",
        lastSuccess: { requestId: "request-1", data: { saved: true } },
    });
    await waitFor(() => requests === 2);
    writeSyncValue(target, {
        activity: "idle",
        lastSuccess: { data: { saved: true }, requestId: "request-1" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toBe(2);

    writeSyncValue(target, {
        activity: "idle",
        lastSuccess: { requestId: "request-2", data: { saved: true } },
    });
    await waitFor(() => requests === 3);
    query.dispose();
    writeSyncValue(target, undefined);
});

test("a remote query restarts after its input changes away and back while in flight", async () => {
    const target = { scope: "page", key: "ulvia-official-fast-filter" } as const;
    writeSyncValue(target, "draft");
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-query-input='{"status":{"from":"state","key":"@page:ulvia-official-fast-filter"}}'
        cms-query-listen="@page:ulvia-official-fast-filter"
    ></section>`);
    document.body.appendChild(host);
    const inputs: unknown[] = [];
    let releaseFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });
    const query = new Query(
        host,
        {},
        {
            request: async (_url, _signal, init) => {
                inputs.push(JSON.parse(String(init?.body)));
                if (inputs.length === 1) {
                    await firstRequest;
                }
                return { kind: "success", data: [] };
            },
        },
    );

    query.start();
    await waitFor(() => inputs.length === 1);
    writeSyncValue(target, "published");
    writeSyncValue(target, "draft");
    releaseFirst();
    await waitFor(() => inputs.length === 2);
    expect(inputs).toEqual([{ status: "draft" }, { status: "draft" }]);
    query.dispose();
    writeSyncValue(target, undefined);
});

test("a remote query treats synchronized inputs as snapshots without an explicit listener", async () => {
    const target = { scope: "page", key: "ulvia-official-snapshot-filter" } as const;
    writeSyncValue(target, "draft");
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-query-input='{"status":{"from":"state","key":"@page:ulvia-official-snapshot-filter"}}'
    ></section>`);
    document.body.appendChild(host);
    const inputs: unknown[] = [];
    const query = new Query(
        host,
        {},
        {
            request: async (_url, _signal, init) => {
                inputs.push(JSON.parse(String(init?.body)));
                return { kind: "success", data: [] };
            },
        },
    );

    query.start();
    await waitFor(() => inputs.length === 1);
    writeSyncValue(target, "published");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(inputs).toEqual([{ status: "draft" }]);
    query.dispose();
    writeSyncValue(target, undefined);
});

test("a synchronized-state query consumes the producer snapshot without HTTP", () => {
    const target = { scope: "page", key: "ulvia-official-shared-products" } as const;
    const host = el(`<section cms-query="@page:ulvia-official-shared-products as products">
        <p cms-condition="products.hasData">{{ products.data.name }}</p>
    </section>`);
    document.body.appendChild(host);
    const query = new Query(host, {}, { request: async () => Promise.reject(new Error("must not fetch")) });

    query.start();
    writeSyncValue(target, {
        activity: "idle",
        hasData: true,
        data: { name: "Shared" },
        outcome: { kind: "success", status: 200 },
    });

    expect(host.textContent).toContain("Shared");
    query.dispose();
    writeSyncValue(target, undefined);
});

test("query imports compose several synchronized query states without HTTP", () => {
    const pages = { scope: "page", key: "ulvia-official-shared-pages" } as const;
    const user = { scope: "session", key: "ulvia-official-shared-user" } as const;
    writeSyncValue(pages, { total: 2 });
    writeSyncValue(user, { name: "Ada" });
    const host =
        el(`<section cms-queries="@page:ulvia-official-shared-pages as pages @session:ulvia-official-shared-user as user">
        <p>{{ user.data.name }}: {{ pages.data.total }}</p>
    </section>`);
    document.body.appendChild(host);
    let requests = 0;
    const query = new Query(
        host,
        {},
        {
            request: async () => {
                requests += 1;
                return { kind: "success", data: null };
            },
        },
    );

    query.start();
    expect(host.textContent).toContain("Ada: 2");
    expect(requests).toBe(0);

    writeSyncValue(pages, { total: 3 });
    expect(host.textContent).toContain("Ada: 3");
    query.dispose();
    writeSyncValue(pages, undefined);
    writeSyncValue(user, undefined);
});

test("a primary query renders with imported synchronized query states", async () => {
    const user = { scope: "page", key: "ulvia-official-query-user" } as const;
    writeSyncValue(user, { name: "Ada" });
    const host = el(`<section
        cms-query="catalog.items:list as products"
        cms-queries="@page:ulvia-official-query-user as user"
    ><p>{{ user.data.name }}: {{ products.data.length }}</p></section>`);
    document.body.appendChild(host);
    const query = new Query(host, {}, { request: async () => ({ kind: "success", data: ["one", "two"] }) });

    query.start();
    await waitFor(() => host.textContent?.includes("Ada: 2") === true);
    expect(host.textContent).toContain("Ada: 2");
    query.dispose();
    writeSyncValue(user, undefined);
});

test("a refresh failure retains the previous data and exposes its outcome", async () => {
    const host = el(`<section cms-query="catalog.items:list as products">
        <p>{{ products.data.name }}</p>
        <span cms-condition="products.outcome.kind === 'failure'">Refresh failed</span>
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
                    : { kind: "failure", status: 503, code: "not_ready", retryable: true };
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

test("an acknowledged query refresh reapplies unchanged server values to that form", async () => {
    const host = el(`<section cms-query="profile:get as profile">
        <form>
            <input name="name" value="{{ profile.data.name }}">
        </form>
    </section>`);
    document.body.appendChild(host);
    const query = new Query(host, {}, { request: async () => ({ kind: "success", data: { name: "Server" } }) });

    query.start();
    await waitFor(() => host.querySelector<HTMLInputElement>("input")?.value === "Server");
    const form = host.querySelector("form")!;
    const input = form.querySelector("input")!;
    input.value = "Local draft";

    await query.run({ acknowledge: form });

    expect(input.value).toBe("Server");
    query.dispose();
});
