/** Installed only in disposable Docker processes. Never records credentials, queries or bodies. */
export function networkPreloadSource(logFile = "/tmp/ulvia-performance-fetch.ndjson", root = "/app"): string {
    return `
import { appendFileSync } from "node:fs";
import { ClientRequest } from "node:http";
import { createRequire } from "node:module";
const provider = Bun.main === ${JSON.stringify(`${root}/packages/runtimes/ulvia-provider-server/src/index.ts`)};
const runtime = provider ? "ulvia-provider-server" : "cms-edge-server";
const workspaceRequire = createRequire(${JSON.stringify(`${root}/packages/runtimes/`)} + runtime + "/package.json");
const { currentTraceContext } = workspaceRequire("@bernouy/logging/tracing");
const { BufferedLogCollector } = workspaceRequire("@bernouy/cms-observability/logging");
const recordWork = (kind: string, name: string) => appendFileSync(${JSON.stringify(`${logFile}.work`)},
    JSON.stringify({ kind, name, traceId: currentTraceContext()?.traceId }) + "\\n");
const record = (target: string) => {
    const path = new URL(target, "http://probe.invalid").pathname;
    appendFileSync(${JSON.stringify(logFile)}, path + "\\n");
    recordWork("http", path);
};
const original = globalThis.fetch;
globalThis.fetch = Object.assign((...args: Parameters<typeof fetch>) => {
    const target = args[0];
    record(String(typeof target === "string" || target instanceof URL ? target : target.url));
    return original(...args);
}, original);
const end = ClientRequest.prototype.end;
const seen = new WeakSet<ClientRequest>();
ClientRequest.prototype.end = function(this: ClientRequest, ...args: unknown[]) {
    if (!seen.has(this)) {
        seen.add(this);
        record(this.path);
    }
    return Reflect.apply(end, this, args);
};
if (provider) {
    const { MongoClient } = workspaceRequire("mongodb");
    const connected = new WeakSet();
    const connect = MongoClient.prototype.connect;
    MongoClient.prototype.connect = function() {
        if (!connected.has(this)) {
            connected.add(this);
            this.monitorCommands = true;
            this.on("commandStarted", (event) => {
                if (["find", "aggregate", "getMore", "insert", "update", "delete", "findAndModify"].includes(event.commandName)) {
                    const collection = event.command[event.commandName];
                    recordWork("mongo", typeof collection === "string" ? collection : event.commandName);
                }
            });
        }
        return connect.call(this);
    };
}
const enqueue = BufferedLogCollector.prototype.enqueue;
BufferedLogCollector.prototype.enqueue = function(entry) {
    recordWork("log", entry.event);
    return enqueue.call(this, entry);
};
`;
}
