/** Installed only in disposable Docker processes. Never records credentials, queries or bodies. */
export function networkPreloadSource(logFile = "/tmp/ulvia-performance-fetch.ndjson"): string {
    return `
import { appendFileSync } from "node:fs";
import { ClientRequest } from "node:http";
const record = (path: string) => appendFileSync(${JSON.stringify(logFile)}, new URL(path, "http://probe.invalid").pathname + "\\n");
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
`;
}
