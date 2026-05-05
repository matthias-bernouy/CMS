import { describe, test, expect, mock } from "bun:test";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";
import type { TBloc } from "src/socle/interfaces/models";

// Stub prepare_bloc so tests never touch the filesystem or run Bun.build.
// Must be registered before importBloc is imported.
mock.module("src/blocs/prepare_bloc", () => ({
    prepare_bloc: async (
        _view: File,
        _editor: File | null,
        label: string,
        group: string,
        description: string,
        blocId: string,
    ): Promise<TBloc> => ({
        id: blocId,
        name: label,
        group,
        description,
        viewJS: "/*view*/",
        editorJS: "/*editor*/",
    }),
}));

const { default: importBloc } = await import("src/control/api/bloc/bloc.post");

type CreateBlocCall = { bloc: TBloc };

function makeSystem(opts: {
    existingTags?: string[];
    throwOnCreate?: { code: number };
} = {}) {
    const createBlocCalls: CreateBlocCall[] = [];
    const deleteSpy: string[] = [];
    const cache = new Map<string, unknown>();
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

    test("409 on race: createBloc throws Mongo duplicate-key (11000)", async () => {
        const { cms } = makeSystem({ throwOnCreate: { code: 11000 } });
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
    });

    test("description defaults to empty string when omitted", async () => {
        const { cms, createBlocCalls } = makeSystem();
        await importBloc(
            makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: viewFile() }),
            cms
        );
        expect(createBlocCalls[0]?.bloc.description).toBe("");
    });
});
