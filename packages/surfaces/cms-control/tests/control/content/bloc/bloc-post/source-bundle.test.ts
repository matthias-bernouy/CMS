import { describe, test, expect } from "bun:test";
import { Buffer } from "node:buffer";
import { DuplicateBlocTagError, P9R_CACHE } from "@bernouy/cms-content";
import type { TBloc } from "@bernouy/cms-content";
import importBloc from "cms-control/api/_content/bloc/bloc.post";

type CreateBlocCall = { bloc: TBloc };

function makeSystem(opts: { existingTags?: string[]; throwOnCreate?: unknown } = {}) {
    const createBlocCalls: CreateBlocCall[] = [];
    const deleteSpy: string[] = [];
    const cache = new Map<string, unknown>();
    cache.set(P9R_CACHE.blocset(["my-bloc", "other-bloc"]), {});
    cache.set(P9R_CACHE.page("/kept"), {});
    const cms: any = {
        repository: {
            getBlocRecord: async (tag: string) => {
                return (opts.existingTags ?? []).includes(tag)
                    ? { tag, ownership: { kind: "code-managed" }, artifact: null }
                    : null;
            },
            getBlocViewJS: async (tag: string) => {
                return (opts.existingTags ?? []).includes(tag) ? "/*existing*/" : null;
            },
            createBloc: async (bloc: TBloc) => {
                if (opts.throwOnCreate) {
                    throw opts.throwOnCreate;
                }
                createBlocCalls.push({ bloc });
                return bloc;
            },
            getAllPages: async () => [],
        },
        cache: {
            get: (k: string) => cache.get(k) ?? null,
            set: (k: string, v: unknown) => {
                cache.set(k, v);
            },
            delete: (k: string) => {
                deleteSpy.push(k);
                cache.delete(k);
            },
            deleteMatching: (predicate: (key: string) => boolean) => {
                for (const key of [...cache.keys()]) {
                    if (!predicate(key)) {
                        continue;
                    }
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
        if (v === null) {
            continue;
        }
        form.append(k, v as any);
    }
    return new Request("http://localhost/cms/api/bloc", {
        method: "POST",
        body: form,
    });
}

const viewFile = () => new File(["/*view*/"], "Bloc.js", { type: "application/javascript" });

function sourceField(files: Record<string, string>): string {
    return JSON.stringify(
        Object.fromEntries(
            Object.entries(files).map(([path, content]) => [path, Buffer.from(content).toString("base64")]),
        ),
    );
}

describe("bloc.post", () => {
    test("400 when tag uses reserved prefix w13c-*", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const res = await importBloc(makeRequest({ name: "My", tag: "w13c-foo", group: "g", viewJS: viewFile() }), cms);
        expect(res.status).toBe(400);
        expect(await res.text()).toMatch(/reserved prefix/);
        expect(createBlocCalls).toHaveLength(0);
    });

    test("400 when tag uses reserved prefix p9r-*", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const res = await importBloc(makeRequest({ name: "My", tag: "p9r-foo", group: "g", viewJS: viewFile() }), cms);
        expect(res.status).toBe(400);
        expect(await res.text()).toMatch(/reserved prefix/);
        expect(createBlocCalls).toHaveLength(0);
    });

    test("400 when source has hardcoded customElements.define", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const bad = new File([`customElements.define("rogue-tag", X);`], "Bloc.js", { type: "application/javascript" });
        const res = await importBloc(makeRequest({ name: "My", tag: "my-bloc", group: "g", viewJS: bad }), cms);
        expect(res.status).toBe(400);
        expect(await res.text()).toMatch(/customElements\.define/);
        expect(createBlocCalls).toHaveLength(0);
    });

    test("passes manifest defaultContent file content to prepare_bloc", async () => {
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
            cms,
        );

        expect(res.status).toBe(200);
        expect(createBlocCalls).toHaveLength(1);
        expect(createBlocCalls[0]?.bloc.editorJS).toContain(
            `<my-bloc><p slot=\\"header\\">Title</p><p>Body</p></my-bloc>`,
        );
    });

    test("rejects native bloc artifacts owned by the platform", async () => {
        const { cms, createBlocCalls } = makeSystem();
        const res = await importBloc(
            makeRequest({
                name: "Paragraph",
                tag: "p",
                group: "Text",
                viewJS: viewFile(),
                source: sourceField({
                    "manifest.json": JSON.stringify({ defaultContent: "./default.html" }),
                    "default.html": `<p>Text</p>`,
                }),
            }),
            cms,
        );

        expect(res.status).toBe(400);
        expect(await res.text()).toContain('Native HTML tag "p" is platform-owned');
        expect(createBlocCalls).toHaveLength(0);
    });
});
