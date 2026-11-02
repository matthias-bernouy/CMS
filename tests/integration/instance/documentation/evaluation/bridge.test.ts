import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluationBridge } from "./bridge";
import type { EvaluationLane } from "./bridge";
import type { Connection } from "../scenarios/client";

test("the agent bridge refuses foreign origins and unsupported transfers before dispatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-agent-boundary-"));
    const connection = { tools: [] } as unknown as Connection;
    const bridge = evaluationBridge(connection, "http://127.0.0.1:12345", root, "draft");
    try {
        await expect(
            bridge.execute("collection", "http", { method: "PUT", url: "https://outside.invalid/upload" }),
        ).rejects.toThrow("isolated evaluation Edge");
        await expect(bridge.execute("upload", "http", { method: "DELETE", url: "/anything" })).rejects.toThrow(
            "Only GET and PUT",
        );
        await expect(bridge.execute("foreign" as EvaluationLane, "catalogue", {})).rejects.toThrow(
            "Unknown evaluation lane",
        );
        expect(bridge.events).toHaveLength(2);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the bridge records text-only Gateway refusals and bounds each participant independently", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-agent-budget-"));
    const connection = {
        tools: [],
        rpc: async () => ({ isError: true, content: [{ type: "text", text: '{"error":{"code":"not_authorized"}}' }] }),
    } as unknown as Connection;
    const bridge = evaluationBridge(connection, "http://127.0.0.1:12345", root, "draft");
    try {
        await bridge.execute("collection", "rpc", { method: "tools/call", params: {} });
        expect(bridge.events[0]?.errorCode).toBe("not_authorized");
        for (let index = 1; index < 60; index++) {
            await bridge.execute("collection", "catalogue", {});
        }
        await expect(bridge.execute("collection", "catalogue", {})).rejects.toThrow("budget is exhausted");
        expect(bridge.events).toHaveLength(60);
        await expect(bridge.execute("observer", "catalogue", {})).resolves.toEqual([]);
        await expect(bridge.execute("revision", "catalogue", {})).resolves.toEqual([]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a lost completion reply follows one committed upload and leaves its state readable", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-agent-lost-reply-"));
    let completed = false;
    let completions = 0;
    const connection = {
        tools: [{ name: "complete", _meta: { "io.ulvia/capability": "workspace.upload.complete" } }],
        rpc: async (_method: string, params: { name: string }) => {
            if (params.name === "complete") {
                completed = true;
                completions++;
                return { structuredContent: { output: null } };
            }
            return { structuredContent: { output: { completed } } };
        },
    } as unknown as Connection;
    const bridge = evaluationBridge(connection, "http://127.0.0.1:12345", root, "draft", {
        loseCompletionResponse: true,
    });
    try {
        await expect(
            bridge.execute("upload", "rpc", {
                method: "tools/call",
                params: { name: "complete" },
            }),
        ).rejects.toThrow("response was lost");
        expect(completions).toBe(1);
        expect(bridge.events[0]?.responseSuppressed).toBe(true);
        await expect(
            bridge.execute("upload", "rpc", {
                method: "tools/call",
                params: { name: "get" },
            }),
        ).resolves.toEqual({ structuredContent: { output: { completed: true } } });
        await expect(
            bridge.execute("upload", "rpc", {
                method: "tools/call",
                params: { name: "complete" },
            }),
        ).resolves.toEqual({ structuredContent: { output: null } });
        expect(completions).toBe(2);
        expect(bridge.events.filter((event) => event.responseSuppressed)).toHaveLength(1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
