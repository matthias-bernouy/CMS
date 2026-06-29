import { describe, test, expect, mock } from "bun:test";
import { Buffer } from "node:buffer";
import { DuplicateBlocTagError, P9R_CACHE } from "@bernouy/cms-content";
import type { TBloc } from "@bernouy/cms-content";

const prepareBlocCalls: Array<{
    blocId: string;
    source?: Record<string, string>;
    defaultContent?: string;
}> = [];

// Stub prepare_bloc so tests never touch the filesystem or run Bun.build.
// Must be registered before importBloc is imported.
const realBlocCompile = await import("@bernouy/cms-bloc-compile");
mock.module("@bernouy/cms-bloc-compile", () => ({
    ...realBlocCompile,
    prepare_bloc: async (
        _view: File,
        _editor: File | null,
        label: string,
        group: string,
        description: string,
        blocId: string,
        source?: Record<string, string>,
        defaultContent?: string,
    ): Promise<TBloc> => {
        prepareBlocCalls.push({ blocId, source, defaultContent });
        return {
            id:       blocId,
            name:     label,
            group,
            description,
            viewJS:   "/*view*/",
            editorJS: "/*editor*/",
        };
    },
}));

const { default: importBloc } = await import("cms-control/api/bloc/bloc.post");

type CreateBlocCall = { bloc: TBloc };

function makeSystem(opts: {
    existingTags?: string[];
    throwOnCreate?: unknown;
} = {}) {
    const createBlocCalls: CreateBlocCall[] = [];
    const deleteSpy: string[] = [];
    const cache = new Map<string, unknown>();
    cache.set(P9R_CACHE.blocset(["my-bloc", "other-bloc"]), {});
    cache.set(P9R_CACHE.page("/kept"), {});
    const cms: any = {
        repository: {
            getBlocViewJS: async (tag: string) => {
                return (opts.existingTags ?? []).includes(tag) ? "/*existing*/" : null;
            },
            createBloc: async (bloc: TBloc) => {
                if (opts.throwOnCreate) throw opts.throwOnCreate;
                createBlocCalls.push({ bloc });
                return bloc;
            },
            getAllPages: async () => [],
            getAllSnippets: async () => [],
        },
        cache: {
            get: (k: string) => cache.get(k) ?? null,
            set: (k: string, v: unknown) => { cache.set(k, v); },
            delete: (k: string) => { deleteSpy.push(k); cache.delete(k); },
            deleteMatching: (predicate: (key: string) => boolean) => {
                for (const key of [...cache.keys()]) {
                    if (!predicate(key)) continue;
                    deleteSpy.push(key);
                    cache.delete(key);
                }
            },
        },
    };
    return { cms, createBlocCalls, deleteSpy };
}

function makeRequest(fields: Record<string, string | File | null>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        if (v === null) continue;
        form.append(k, v as any);
    }
    return new Request("http://localhost/cms/api/bloc", {
        method: "POST",
        body: form,
    });
}

const viewFile = () => new File(["/*view*/"], "Bloc.js", { type: "application/javascript" });

function sourceField(files: Record<string, string>): string {
    return JSON.stringify(Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path, Buffer.from(content).toString("base64")]),
    ));
}

describe("bloc.post", () => {
    test("400 when name is missing", async () => {
        const { cms } = makeSystem();
        const res = await importBloc(
            makeRequest({ tag: "my-bloc", viewJS: viewFile(), group: "g" }),
            cms
        );
        expect(res.status).toBe(400);
    });

    test("400 when viewJS is missing", async () => {
        const { cms } = makeSystem();
        const res = await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "g" }),
            cms
        );
        expect(res.status).toBe(400);
    });

    test("400 when tag is missing", async () => {
        const { cms } = makeSystem();
        const res = await importBloc(
            makeRequest({ name: "My", viewJS: viewFile(), group: "g" }),
            cms
        );
        expect(res.status).toBe(400);
    });

    test("409 when a bloc with the same tag already exists", async () => {
        const { cms, createBlocCalls } = makeSystem({ existingTags: ["my-bloc"] });
        const res = await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: viewFile() }),
            cms
        );
        expect(res.status).toBe(409);
        expect(await res.text()).toContain("already exists");
        expect(createBlocCalls).toHaveLength(0);
    });

    test("409 on race: createBloc throws duplicate bloc domain error", async () => {
        const { cms } = makeSystem({ throwOnCreate: new DuplicateBlocTagError("my-bloc") });
        const res = await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: viewFile() }),
            cms
        );
        expect(res.status).toBe(409);
    });

    test("rethrows non-duplicate-key errors", async () => {
        const { cms } = makeSystem({ throwOnCreate: { code: 9999 } });
        expect(
            importBloc(
                makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: viewFile() }),
                cms
            )
        ).rejects.toBeDefined();
    });

    test("happy path: creates bloc and invalidates its cache key", async () => {
        const { cms, createBlocCalls, deleteSpy } = makeSystem();
        const res = await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "cards", description: "d", viewJS: viewFile() }),
            cms
        );
        expect(res.status).toBe(200);
        expect(createBlocCalls).toHaveLength(1);
        expect(createBlocCalls[0]?.bloc.id).toBe("my-bloc");
        expect(createBlocCalls[0]?.bloc.name).toBe("My");
        expect(createBlocCalls[0]?.bloc.group).toBe("cards");
        expect(deleteSpy).toContain(P9R_CACHE.bloc("my-bloc"));
        expect(deleteSpy).toContain(P9R_CACHE.EDITOR_SCRIPT);
        expect(deleteSpy).toContain(P9R_CACHE.EDITOR_VIEW_SCRIPT);
        expect(deleteSpy).toContain(P9R_CACHE.blocset(["my-bloc", "other-bloc"]));
        expect(deleteSpy).not.toContain(P9R_CACHE.page("/kept"));
    });

    test("description defaults to empty string when omitted", async () => {
        const { cms, createBlocCalls } = makeSystem();
        await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: viewFile() }),
            cms
        );
        expect(createBlocCalls[0]?.bloc.description).toBe("");
    });

    test("400 when tag uses reserved prefix w13c-*", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const res = await importBloc(
            makeRequest({ name: "My", tag: "w13c-foo", group: "g", viewJS: viewFile() }),
            cms
        );
        expect(res.status).toBe(400);
        expect(await res.text()).toMatch(/reserved prefix/);
        expect(createBlocCalls).toHaveLength(0);
    });

    test("400 when tag uses reserved prefix p9r-*", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const res = await importBloc(
            makeRequest({ name: "My", tag: "p9r-foo", group: "g", viewJS: viewFile() }),
            cms
        );
        expect(res.status).toBe(400);
        expect(await res.text()).toMatch(/reserved prefix/);
        expect(createBlocCalls).toHaveLength(0);
    });

    test("400 when source has hardcoded customElements.define", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const bad = new File(
            [`customElements.define("rogue-tag", X);`],
            "Bloc.js",
            { type: "application/javascript" },
        );
        const res = await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: bad }),
            cms
        );
        expect(res.status).toBe(400);
        expect(await res.text()).toMatch(/customElements\.define/);
        expect(createBlocCalls).toHaveLength(0);
    });

    test("passes manifest defaultContent file content to prepare_bloc", async () => {
        prepareBlocCalls.length = 0;
        const { cms, createBlocCalls } = makeSystem();
        const res = await importBloc(
            makeRequest({
                name: "My",
                tag: "my-bloc",
                group: "g",
                viewJS: viewFile(),
                source: sourceField({
                    "manifest.json": JSON.stringify({ defaultContent: "./default.html" }),
                    "default.html": `<my-bloc><p slot="header">Title</p><p>Body</p></my-bloc>`,
                }),
            }),
            cms
        );

        expect(res.status).toBe(200);
        expect(createBlocCalls).toHaveLength(1);
        expect(prepareBlocCalls[0]?.defaultContent).toBe(`<my-bloc><p slot="header">Title</p><p>Body</p></my-bloc>`);
    });
});
