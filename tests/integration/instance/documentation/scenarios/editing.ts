import { expect } from "bun:test";
import { invoke, refusal } from "./client";
import type { Connection } from "./client";

export async function concurrentEditing(connection: Connection, cmsUrl: string) {
    const { call } = connection;
    const page = await call("ulvia.cms.content", "pages.create", {
        path: "/concurrent-authors",
        title: "Draft — 中文 🚀",
    });
    expect((await fetch(`${cmsUrl}/concurrent-authors`)).status).toBe(404);
    const proposals = ["Editor A — première version", "Editor B — 第二版"];
    const results = await Promise.all(
        proposals.map((title) =>
            invoke(connection, "ulvia.cms.content", "pages.update", {
                id: page.id,
                expectedRevision: page.revision,
                title,
            }),
        ),
    );
    expect(results.filter((result) => !result.isError)).toHaveLength(1);
    const losing = results.find((result) => result.isError)!;
    refusal(losing, "REVISION_CONFLICT");
    const winner = results.find((result) => !result.isError)!.structuredContent.output;
    const { diagnostics, ...expectedPage } = winner;
    expect(diagnostics).toEqual([]);
    const saved = await call("ulvia.cms.content", "pages.get", { id: page.id });
    expect(saved).toMatchObject(expectedPage);
    expect(saved).not.toHaveProperty("diagnostics");
    const invalid = await invoke(connection, "ulvia.cms.content", "pages.update", {
        id: page.id,
        expectedRevision: winner.revision,
        content: '<script>alert("unsafe")</script>',
    });
    refusal(invalid, "INVALID_PAGE");
    expect(await call("ulvia.cms.content", "pages.get", { id: page.id })).toEqual(saved);
    refusal(
        await invoke(connection, "ulvia.cms.content", "pages.create", {
            path: page.path,
            title: "Conflicting path",
        }),
        "PATH_CONFLICT",
    );
    const recovered = await call("ulvia.cms.content", "pages.update", {
        id: page.id,
        expectedRevision: winner.revision,
        title: "Merged review — 中文 🚀",
        content: '<h1 cms-bloc="ulvia-official-heading" size="lg" text-align="start">Reviewed — 中文 🚀</h1>',
    });
    refusal(
        await invoke(connection, "ulvia.cms.content", "pages.publish", {
            id: page.id,
            expectedRevision: winner.revision,
            visible: true,
        }),
        "REVISION_CONFLICT",
    );
    expect((await fetch(`${cmsUrl}/concurrent-authors`)).status).toBe(404);
    const published = await call("ulvia.cms.content", "pages.publish", {
        id: page.id,
        expectedRevision: recovered.revision,
        visible: true,
    });
    const view = await connection.browser.newPage();
    try {
        for (const width of [320, 1440]) {
            await view.setViewportSize({ width, height: 800 });
            expect((await view.goto(`${cmsUrl}/concurrent-authors`))?.status()).toBe(200);
            expect(await view.locator("h1").innerText()).toBe("Reviewed — 中文 🚀");
        }
    } finally {
        await view.close();
    }
    await call("ulvia.cms.content", "pages.publish", {
        id: page.id,
        expectedRevision: published.revision,
        visible: false,
    });
    expect((await fetch(`${cmsUrl}/concurrent-authors`)).status).toBe(404);
}
