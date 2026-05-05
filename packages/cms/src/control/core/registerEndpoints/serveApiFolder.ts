import type { Runner } from "@bernouy/socle";
import { basename, dirname, join } from "node:path";

type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

function isHTTPMethod(s: string): s is HTTPMethod {
    return (ALLOWED_METHODS as readonly string[]).includes(s);
}

function deriveRoute(namePart: string): string {
    const dir = dirname(namePart);
    const name = basename(namePart);

    if (dir === ".") return name;
    if (name === basename(dir)) return dir;
    return namePart;
}

export async function serveApi<T>(runner: Runner, folder: string, system: T): Promise<void> {
    type RouteEntry = { file: string; method: HTTPMethod; route: string };
    const seen = new Map<string, RouteEntry>();

    for await (const file of new Bun.Glob("**/*.ts").scan(folder)) {
        const parts = file.split(".");
        if (parts.length < 3) continue;

        const rawMethod = (parts[parts.length - 2] ?? "").toUpperCase();
        if (!isHTTPMethod(rawMethod)) continue;

        const namePart = parts.slice(0, -2).join(".");
        const route = deriveRoute(namePart);
        const key = `${rawMethod} ${route}`;

        const existing = seen.get(key);
        if (existing) {
            throw new Error(`[serveApi] Conflict: ${rawMethod} /${route} declared in both "${existing.file}" and "${file}"`);
        }

        seen.set(key, { file: join(folder, file), method: rawMethod, route });
    }

    for (const { file, method, route } of seen.values()) {
        const mod = await import(file);
        const handler = mod.default;

        if (typeof handler !== "function") {
            throw new Error(`[serveApi] "${file}" must have a default export function`);
        }
        
        runner.addEndpoint(method, `/${route}`, (req: Request) => handler(req, system));
    }
}
