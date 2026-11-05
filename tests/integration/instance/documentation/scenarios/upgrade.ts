import { expect } from "bun:test";
import { invoke, operation, refusal } from "./client";
import type { Connection } from "./client";

export async function collectionUpgrade(connection: Connection, cmsUrl: string) {
    const { call } = connection;
    const sources = await call("ulvia/cms.authoring", "get-collection-sources", {
        namespace: "documentation-exotic",
        collectionId: "ulvia/mcp-kit",
        version: "1.0.0",
    });
    const source = JSON.parse(sources.sourceJson);
    const definition = source.files.find((file: { path: string }) => file.path === "definition.json");
    definition.content = JSON.stringify({ ...JSON.parse(definition.content), version: "1.1.0" });
    const markup = source.files.find((file: { path: string }) => file.path === "blocs/mcp-kit-panel/markup.html");
    markup.content = '<article><slot name="body"></slot></article>';
    const prepared = await call("ulvia/cms.authoring", "prepare-collection", { sourceJson: JSON.stringify(source) });
    expect(prepared.valid).toBe(true);
    expect(prepared.diagnostics).toEqual([]);
    await call("ulvia/cms.authoring", "publish-collection", {
        preparationId: prepared.preparationId,
        expectedDigest: prepared.digest,
    });
    const targets = [
        {
            repositoryId: prepared.repositoryId,
            publisherId: prepared.publisherId,
            collectionId: prepared.collectionId,
            version: prepared.version,
            digest: prepared.digest,
            approvedBrowserRiskDigest: prepared.approvedBrowserRiskDigest,
        },
    ];
    const installed = await call("ulvia/cms.installations", "list-collection-installations");
    const plan = await call("ulvia/cms.installations", "plan-collection-upgrade", { targets });
    expect(plan.status).toBe("applicable");
    expect(plan.issues).toEqual([]);
    const pages = await call("ulvia/cms.content", "pages.list", { query: "MCP regression", limit: 1 });
    const page = await call("ulvia/cms.content", "pages.get", { id: pages.items[0].id });
    const edited = await call("ulvia/cms.content", "pages.update", {
        id: page.id,
        expectedRevision: page.revision,
        title: "Reviewed collection upgrade",
    });
    const stale = await invoke(
        connection,
        "ulvia/cms.installations",
        "apply-collection-upgrade",
        {
            targets,
            planDigest: plan.planDigest,
        },
        "stale-collection-plan",
    );
    expect(stale.isError).not.toBe(true);
    const failed = await operation(connection, stale.structuredContent.output.operationId);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("REVISION_CONFLICT");
    expect(failed.errorOutput.message.length).toBeGreaterThan(0);
    expect(await call("ulvia/cms.installations", "list-collection-installations")).toEqual(installed);
    const reviewed = await call("ulvia/cms.installations", "plan-collection-upgrade", { targets });
    expect(reviewed.status).toBe("applicable");
    const input = { targets, planDigest: reviewed.planDigest };
    const accepted = await invoke(
        connection,
        "ulvia/cms.installations",
        "apply-collection-upgrade",
        input,
        "reviewed-collection-plan",
    );
    expect(accepted.isError).not.toBe(true);
    const replay = await invoke(
        connection,
        "ulvia/cms.installations",
        "apply-collection-upgrade",
        input,
        "reviewed-collection-plan",
    );
    expect(replay.structuredContent).toEqual(accepted.structuredContent);
    const completed = await operation(connection, accepted.structuredContent.output.operationId);
    expect(completed.status).toBe("succeeded");
    expect(completed.result.status).toBe("completed");
    const after = await call("ulvia/cms.installations", "list-collection-installations");
    expect(after.revision).toBe(installed.revision + 1);
    expect(after.items.find((item: { collectionId: string }) => item.collectionId === "ulvia/mcp-kit").version).toBe(
        "1.1.0",
    );
    const { diagnostics, ...expectedPage } = edited;
    expect(diagnostics).toEqual([]);
    const savedPage = await call("ulvia/cms.content", "pages.get", { id: page.id });
    expect(savedPage).toMatchObject(expectedPage);
    expect(savedPage).not.toHaveProperty("diagnostics");
    expect(edited.content).toBe(page.content);
    const rendered = await connection.browser.newPage();
    try {
        await rendered.goto(`${cmsUrl}/mcp-regression`);
        expect(await rendered.locator("article").innerText()).toContain("Created through MCP");
    } finally {
        await rendered.close();
    }
    refusal(
        await invoke(
            connection,
            "ulvia/cms.installations",
            "apply-collection-upgrade",
            {
                targets,
                planDigest: plan.planDigest,
            },
            "reviewed-collection-plan",
        ),
        "IDEMPOTENCY_CONFLICT",
    );
    expect(await call("ulvia/cms.installations", "list-collection-installations")).toEqual(after);
    await call("ulvia/cms.authoring", "discard-preparation", { preparationId: prepared.preparationId });
}
