import { describe, test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MockupsStore } from "src/cli/dev-server/repo/mockups";
import { mockupFile } from "src/cli/push/shared/mockupsLayout";

function makeStore(): { store: MockupsStore; siteDir: string } {
    const siteDir = mkdtempSync(join(tmpdir(), "mockups-store-"));
    return { store: new MockupsStore(siteDir), siteDir };
}

const seed = (overrides: Partial<{
    providerId: string; method: string; path: string; name: string; status: number; body: string;
}> = {}) => ({
    providerId: "hub-api",
    method:     "GET",
    path:       "/users/{id}",
    name:       "default",
    status:     200,
    body:       '{"id":1}',
    ...overrides,
});

describe("MockupsStore — create", () => {
    test("first mockup of an operation becomes active automatically", async () => {
        const { store } = makeStore();
        const m = await store.create(seed());
        expect(m.active).toBe(true);
    });

    test("subsequent mockups for the same op are inactive by default", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "default" }));
        const second = await store.create(seed({ name: "not-found", status: 404 }));
        expect(second.active).toBe(false);
    });

    test("rejects collision on (provider, method, path, name)", async () => {
        const { store } = makeStore();
        await store.create(seed());
        await expect(store.create(seed())).rejects.toThrow(/already exists/);
    });

    test("uppercases the stored method", async () => {
        const { store } = makeStore();
        const m = await store.create(seed({ method: "post", path: "/users", name: "x" }));
        expect(m.method).toBe("POST");
    });

    test("writes the file at the layout-derived path", async () => {
        const { store, siteDir } = makeStore();
        await store.create(seed());
        const expected = mockupFile(join(siteDir, "mockups"), "hub-api", "GET", "/users/{id}", "default");
        expect(existsSync(expected)).toBe(true);
    });
});

describe("MockupsStore — read", () => {
    test("get returns the mockup verbatim", async () => {
        const { store } = makeStore();
        await store.create(seed({ status: 201, body: '{"hello":"world"}' }));
        const m = await store.get("hub-api", "GET", "/users/{id}", "default");
        expect(m).not.toBeNull();
        expect(m!.status).toBe(201);
        expect(m!.body).toBe('{"hello":"world"}');
    });

    test("get returns null when missing", async () => {
        const { store } = makeStore();
        expect(await store.get("hub-api", "GET", "/x", "y")).toBeNull();
    });

    test("listFor returns every mockup of one provider", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "a" }));
        await store.create(seed({ name: "b" }));
        await store.create(seed({ providerId: "other", name: "z" }));

        const list = await store.listFor("hub-api");
        expect(list.map(m => m.name).sort()).toEqual(["a", "b"]);
    });

    test("getActive returns the active mockup of an operation", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "first" }));
        await store.create(seed({ name: "second" }));

        const active = await store.getActive("hub-api", "GET", "/users/{id}");
        expect(active?.name).toBe("first");
    });
});

describe("MockupsStore — update", () => {
    test("patches status and body", async () => {
        const { store } = makeStore();
        await store.create(seed());
        const updated = await store.update("hub-api", "GET", "/users/{id}", "default", { status: 418, body: '{"teapot":true}' });
        expect(updated?.status).toBe(418);
        expect(updated?.body).toBe('{"teapot":true}');
    });

    test("renaming moves the file", async () => {
        const { store, siteDir } = makeStore();
        await store.create(seed());
        await store.update("hub-api", "GET", "/users/{id}", "default", { name: "renamed" });

        const root = join(siteDir, "mockups");
        expect(existsSync(mockupFile(root, "hub-api", "GET", "/users/{id}", "default"))).toBe(false);
        expect(existsSync(mockupFile(root, "hub-api", "GET", "/users/{id}", "renamed"))).toBe(true);
    });

    test("rejects rename onto an existing name", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "a" }));
        await store.create(seed({ name: "b" }));
        await expect(
            store.update("hub-api", "GET", "/users/{id}", "a", { name: "b" })
        ).rejects.toThrow(/already exists/);
    });
});

describe("MockupsStore — setActive", () => {
    test("flipping active demotes the previous one", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "first" }));   // active by default
        await store.create(seed({ name: "second" }));

        await store.setActive("hub-api", "GET", "/users/{id}", "second");
        const active = await store.getActive("hub-api", "GET", "/users/{id}");
        expect(active?.name).toBe("second");
    });

    test("passing null clears active for the operation", async () => {
        const { store } = makeStore();
        await store.create(seed());
        await store.setActive("hub-api", "GET", "/users/{id}", null);
        expect(await store.getActive("hub-api", "GET", "/users/{id}")).toBeNull();
    });

    test("does not affect other operations", async () => {
        const { store } = makeStore();
        await store.create(seed({ method: "GET",  name: "g" }));
        await store.create(seed({ method: "POST", path: "/users", name: "p" }));
        await store.setActive("hub-api", "GET", "/users/{id}", null);
        expect((await store.getActive("hub-api", "POST", "/users"))?.name).toBe("p");
    });
});

describe("MockupsStore — delete", () => {
    test("deleting the only mockup leaves the operation empty", async () => {
        const { store } = makeStore();
        await store.create(seed());
        await store.delete("hub-api", "GET", "/users/{id}", "default");
        expect(await store.get("hub-api", "GET", "/users/{id}", "default")).toBeNull();
    });

    test("deleting an active mockup promotes a sibling to active", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "first" }));   // active
        await store.create(seed({ name: "second" }));

        await store.delete("hub-api", "GET", "/users/{id}", "first");
        const active = await store.getActive("hub-api", "GET", "/users/{id}");
        expect(active?.name).toBe("second");
        expect(active?.active).toBe(true);
    });

    test("deleting an inactive mockup leaves the active one unchanged", async () => {
        const { store } = makeStore();
        await store.create(seed({ name: "first" }));
        await store.create(seed({ name: "second" }));

        await store.delete("hub-api", "GET", "/users/{id}", "second");
        expect((await store.getActive("hub-api", "GET", "/users/{id}"))?.name).toBe("first");
    });

    test("deleteAllFor wipes the provider folder", async () => {
        const { store, siteDir } = makeStore();
        await store.create(seed({ name: "a" }));
        await store.create(seed({ name: "b", path: "/elsewhere" }));

        await store.deleteAllFor("hub-api");
        expect(await store.listFor("hub-api")).toEqual([]);
        expect(existsSync(join(siteDir, "mockups", "hub-api"))).toBe(false);
    });
});
