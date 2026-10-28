import { expect } from "bun:test";
import type { connectBrowser } from "./oauth";

export async function exerciseObservabilityMcp(connection: Awaited<ReturnType<typeof connectBrowser>>, logId: string) {
    const tools = connection.tools.filter((tool) => tool._meta["io.ulvia/contract"] === "ulvia.cms.observability");
    expect(tools.map(({ name }) => name).sort()).toEqual([
        "observability_logs_aggregate",
        "observability_logs_get",
        "observability_logs_query",
    ]);
    const filter = { event: "docker.scope.probe", timeField: "receivedAt" };
    const query = await connection.call("ulvia.cms.observability", "logs.query", { ...filter, limit: 1 });
    expect(query.items.map((entry: { id: string }) => entry.id)).toEqual([logId]);
    const detail = await connection.call("ulvia.cms.observability", "logs.get", { id: logId });
    expect(detail).toMatchObject({ id: logId, event: "docker.scope.probe" });
    expect(JSON.stringify(detail)).not.toContain("do-not-persist");
    const aggregate = await connection.call("ulvia.cms.observability", "logs.aggregate", {
        ...filter,
        groupBy: "level",
    });
    expect(aggregate).toMatchObject({ total: 1, groups: [{ key: "error", count: 1 }] });
    await expect(
        connection.call("ulvia.cms.observability", "logs.query", { ...filter, instanceId: "another-instance" }),
    ).rejects.toThrow();
}
