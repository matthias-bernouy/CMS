import { expect } from "bun:test";
import { publicReader } from "../client/reader";
import { restart } from "../evidence/containers";
import { stylePaths } from "../evidence/summary";
import { requirePage } from "../evidence/context";
import { repositoryApi } from "../../../integration/instance/repository/client";
import type { Context } from "../evidence/context";
import type { ScenarioId } from "../plan";

export async function correctnessScenario(context: Context, id: ScenarioId) {
    if (id === "public.write-invalidation") {
        return invalidate(context, id);
    }
    if (id === "public.private-response") {
        return privateResponse(context, id);
    }
    return styles(context, id);
}
async function invalidate(context: Context, id: ScenarioId) {
    const { stack, connection, sample, options, reader } = context;
    const replica = await stack.createEdgeReplica();
    const second = publicReader(stack.cmsUrl, replica.endpoint);
    try {
        for (let epoch = 1; epoch <= options.epochs; epoch++) {
            for (const endpoint of [undefined, { reader: second, name: replica.name }]) {
                requirePage(
                    await sample(id, "prime", epoch, false, undefined, {}, endpoint),
                    endpoint?.reader ?? reader,
                );
                requirePage(
                    await sample(id, "prime", epoch, false, undefined, {}, endpoint),
                    endpoint?.reader ?? reader,
                    "HIT",
                );
            }
            const listing = await connection.call("ulvia/cms.content", "pages.list", { limit: 100 });
            const listed = listing.items.find((item: { path: string }) => item.path === "/performance-literal");
            expect(listed).toBeDefined();
            const page = await connection.call("ulvia/cms.content", "pages.get", { id: listed.id });
            const marker = `Performance revision ${epoch}`;
            await connection.call("ulvia/cms.content", "pages.update", {
                id: page.id,
                expectedRevision: page.revision,
                content: `<div cms-bloc="ulvia-dtest--smoke-kit--card"><p slot="content">${marker}</p></div>`,
            });
            for (const endpoint of [undefined, { reader: second, name: replica.name }]) {
                const client = endpoint?.reader ?? reader;
                const row = await sample(
                    id,
                    endpoint ? "replica-after-write" : "primary-after-write",
                    epoch,
                    true,
                    undefined,
                    {},
                    endpoint,
                );
                requirePage(row, client);
                expect(client.bodies[row.hash!]!).toContain(marker);
                expect(row.cache).not.toBe("HIT");
            }
        }
    } finally {
        second.close();
    }
}
async function styles(context: Context, id: ScenarioId) {
    const { reader, stack, sample, epochs, findings, options } = context;
    for (let epoch = 1; epoch <= options.epochs; epoch++) {
        const before = await sample(id, "prime", epoch, false);
        requirePage(before, reader);
        const previous = stylePaths(reader.bodies[before.hash!]!, stack.cmsUrl);
        expect(previous.length).toBeGreaterThan(0);
        for (const path of previous) {
            const row = await sample(id, "style-before", epoch, false, path);
            expect(row.status).toBe(200);
        }
        epochs.push({ scenario: id, epoch, ...(await restart(stack, true)) });
        const after = await sample(id, "page-after-restart", epoch);
        requirePage(after, reader);
        const current = stylePaths(reader.bodies[after.hash!]!, stack.cmsUrl);
        for (const path of [...new Set([...previous, ...current])]) {
            const row = await sample(
                id,
                previous.includes(path) ? "old-style-after-restart" : "new-style-after-restart",
                epoch,
                true,
                path,
            );
            if (row.failure || row.status !== 200 || !row.contentType?.includes("text/css")) {
                findings.push({
                    scenario: id,
                    code: "stylesheet-unavailable",
                    detail: `${path}: HTTP ${row.status}; old=${previous.includes(path)}`,
                });
            }
        }
        if (after.hash !== before.hash) {
            findings.push({
                scenario: id,
                code: "html-bytes-changed",
                detail: `Exact HTML differs after restart ${epoch}; no stylesheet URL normalization applied`,
            });
        }
    }
}
async function privateResponse(context: Context, id: ScenarioId) {
    const { stack, connection, sample, reader } = context;
    const api = repositoryApi(stack.cmsUrl);
    const actor = await api.session(stack.administrator.email, stack.administrator.password);
    const draft = await connection.call("ulvia/cms.content", "pages.create", {
        path: "/performance-private-draft",
        title: "Private draft",
        content: '<div cms-bloc="ulvia-dtest--smoke-kit--card"><p slot="content">Private draft witness</p></div>',
    });
    expect(draft.id).toBeDefined();
    const privateRow = await sample(id, "authenticated-draft", 0, true, "/performance-private-draft", {
        cookie: actor.cookie,
    });
    expect(privateRow.status).toBe(200);
    expect(privateRow.cache).toBe("BYPASS");
    expect(privateRow.cacheControl).toBe("private, no-store");
    expect(reader.bodies[privateRow.hash!]!).toContain("Private draft witness");
    const anonymous = await sample(id, "anonymous-draft-refusal", 0, false, "/performance-private-draft");
    expect(anonymous.status).toBe(404);
    expect(reader.bodies[anonymous.hash!]!).not.toContain("Private draft witness");
    for (let epoch = 0; epoch < context.options.samples; epoch++) {
        const row = await sample(id, "authenticated-published", epoch, true, undefined, { cookie: actor.cookie });
        requirePage(row, reader, "BYPASS");
        expect(row.cacheControl).toBe("private, no-store");
    }
}
