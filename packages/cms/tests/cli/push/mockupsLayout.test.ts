import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    encodeSegment,
    decodeSegment,
    pathToSegments,
    segmentsToPath,
    mockupFile,
    walkProviderMockups,
} from "src/cli/push/shared/mockupsLayout";

function makeRoot(): string {
    return mkdtempSync(join(tmpdir(), "mockups-layout-"));
}

function touch(file: string, content = "{}"): void {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
}

describe("mockupsLayout — encoding", () => {
    test("encodeSegment swaps {} for []", () => {
        expect(encodeSegment("{id}")).toBe("[id]");
        expect(encodeSegment("users")).toBe("users");
        expect(encodeSegment("a{b}c{d}")).toBe("a[b]c[d]");
    });

    test("decodeSegment reverses the swap", () => {
        expect(decodeSegment("[id]")).toBe("{id}");
        expect(decodeSegment("users")).toBe("users");
    });

    test("encode then decode is identity", () => {
        const samples = ["users", "{id}", "{x}-{y}", "plain", "v1"];
        for (const s of samples) expect(decodeSegment(encodeSegment(s))).toBe(s);
    });
});

describe("mockupsLayout — path↔segments", () => {
    test("root path collapses to no segments", () => {
        expect(pathToSegments("/")).toEqual([]);
        expect(segmentsToPath([])).toBe("/");
    });

    test("nested path round-trips through segments", () => {
        const path = "/users/{id}/posts/{postId}";
        const segs = pathToSegments(path);
        expect(segs).toEqual(["users", "[id]", "posts", "[postId]"]);
        expect(segmentsToPath(segs)).toBe(path);
    });

    test("path with trailing slash normalizes", () => {
        expect(pathToSegments("/users/")).toEqual(["users"]);
        expect(segmentsToPath(["users"])).toBe("/users");
    });
});

describe("mockupsLayout — mockupFile", () => {
    test("nests path segments between provider and method", () => {
        const f = mockupFile("/r", "hub-api", "GET", "/users/{id}", "default");
        expect(f).toBe("/r/hub-api/users/[id]/GET/default.json");
    });

    test("collapses the path level for the root path", () => {
        const f = mockupFile("/r", "hub-api", "POST", "/", "bulk");
        expect(f).toBe("/r/hub-api/POST/bulk.json");
    });

    test("uppercases the method", () => {
        const f = mockupFile("/r", "hub-api", "delete", "/x", "n");
        expect(f).toBe("/r/hub-api/x/DELETE/n.json");
    });
});

describe("mockupsLayout — walkProviderMockups", () => {
    test("finds files nested under method folders", async () => {
        const root = makeRoot();
        touch(join(root, "hub-api/users/[id]/GET/default.json"));
        touch(join(root, "hub-api/users/[id]/GET/not-found.json"));
        touch(join(root, "hub-api/users/[id]/DELETE/forbidden.json"));

        const out = await walkProviderMockups(root, "hub-api");
        const summary = out.map(d => ({ method: d.method, path: d.path, name: d.name })).sort(byKey);
        expect(summary).toEqual([
            { method: "DELETE", path: "/users/{id}", name: "forbidden" },
            { method: "GET",    path: "/users/{id}", name: "default" },
            { method: "GET",    path: "/users/{id}", name: "not-found" },
        ]);
    });

    test("supports root-path operations (no path-level folders)", async () => {
        const root = makeRoot();
        touch(join(root, "hub-api/POST/bulk.json"));

        const out = await walkProviderMockups(root, "hub-api");
        expect(out).toHaveLength(1);
        expect(out[0]!.method).toBe("POST");
        expect(out[0]!.path).toBe("/");
        expect(out[0]!.name).toBe("bulk");
    });

    test("treats a verb-named segment as a path segment when it has subdirs", async () => {
        const root = makeRoot();
        // Path `/get/foo` with method GET — the first `get` is a path segment.
        touch(join(root, "hub-api/get/foo/GET/ok.json"));

        const out = await walkProviderMockups(root, "hub-api");
        expect(out).toHaveLength(1);
        expect(out[0]!.method).toBe("GET");
        expect(out[0]!.path).toBe("/get/foo");
    });

    test("ignores dotfiles and non-json entries", async () => {
        const root = makeRoot();
        touch(join(root, "hub-api/users/GET/default.json"));
        touch(join(root, "hub-api/users/GET/.DS_Store"));
        touch(join(root, "hub-api/users/GET/README.txt"));

        const out = await walkProviderMockups(root, "hub-api");
        expect(out).toHaveLength(1);
        expect(out[0]!.name).toBe("default");
    });

    test("returns empty for a missing provider folder", async () => {
        const root = makeRoot();
        const out  = await walkProviderMockups(root, "no-such-provider");
        expect(out).toEqual([]);
    });
});

function byKey(a: { method: string; path: string; name: string }, b: { method: string; path: string; name: string }): number {
    return `${a.method}|${a.path}|${a.name}`.localeCompare(`${b.method}|${b.path}|${b.name}`);
}
