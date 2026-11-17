import { randomUUID } from "node:crypto";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { isolatedOrigin } from "../transport/http";
import { observe } from "./observe";
import { ClientFailure } from "./failure";
import type { ClientCall, McpTool } from "./types";

export async function observeMcp(call: ClientCall, tools: readonly McpTool[]) {
    isolatedOrigin(call.origin);
    validateSchemaValue(call.target.definition.input, call.input);
    const tool = tools.find(
        ({ _meta }) =>
            _meta["io.ulvia/contract"] === call.target.release.contractId &&
            _meta["io.ulvia/capability"] === call.target.definition.id &&
            _meta["io.ulvia/binding"] === call.binding &&
            _meta["io.ulvia/digest"] === call.target.release.digest,
    );
    if (
        !tool ||
        !call.credentials.token ||
        !call.target.definition.bindings.some((binding) => binding.id === call.binding && binding.transport === "mcp")
    ) {
        throw new Error("Exact MCP binding, release or authenticated fixture is missing");
    }
    const traceId = randomUUID();
    const keyed =
        call.target.definition.behavior.effect === "command" && call.target.definition.behavior.idempotency === "keyed";
    const body = JSON.stringify({
        jsonrpc: "2.0",
        id: traceId,
        method: "tools/call",
        params: {
            name: tool.name,
            arguments: { input: call.input, ...(keyed ? { idempotencyKey: randomUUID() } : {}) },
        },
    });
    return observe(
        call,
        traceId,
        Buffer.byteLength(body),
        (signal) =>
            fetch(`${call.origin}/.cms/mcp`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${call.credentials.token}`,
                    accept: "application/json, text/event-stream",
                    "content-type": "application/json",
                    "mcp-protocol-version": "2025-11-25",
                    "x-request-id": traceId,
                },
                body,
                signal,
                redirect: "manual",
            }),
        (bytes, response) => {
            if (response.status !== 200) {
                throw new ClientFailure("unexpected-mcp-http-status");
            }
            const message = JSON.parse(new TextDecoder().decode(bytes));
            if (message.result?.isError) {
                const code = message.result.structuredContent?.error?.code;
                const declared = call.target.definition.errors.some((error) => error.code === code);
                throw new ClientFailure(declared ? `mcp-declared-${code}` : "mcp-error-result");
            }
            if (
                message.jsonrpc !== "2.0" ||
                message.id !== traceId ||
                message.error ||
                message.result?.isError ||
                !message.result?.structuredContent ||
                !Object.hasOwn(message.result.structuredContent, "output")
            ) {
                throw new Error("MCP response was not a successful matching result");
            }
            return message.result.structuredContent.output;
        },
    );
}
