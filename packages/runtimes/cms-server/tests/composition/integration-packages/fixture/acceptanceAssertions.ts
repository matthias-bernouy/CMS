import { chmod, lstat, opendir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "bun:test";
import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import {
    REMOTE_FUNCTION_MARKER,
    REMOTE_INTEGRATION_KIND,
    REMOTE_INTEGRATION_VERSION,
    REMOTE_SQL_MARKER,
    REMOTE_UPGRADE_DEFINITION,
    REMOTE_UPGRADE_MARKER,
    REMOTE_UPGRADE_VERSION,
} from "./catalogFixture";
import type { FixtureProcess } from "./processHarness";

type InstallationResponse = { installation: Record<string, unknown> };

export async function assertPublicRepository(baseUrl: string): Promise<void> {
    const params = new URLSearchParams({ kind: REMOTE_INTEGRATION_KIND, version: REMOTE_INTEGRATION_VERSION });
    const definition = await fetch(`${baseUrl}/api/integrations/definition?${params}`, { credentials: "omit" });
    expect(definition.status).toBe(200);
    expect(definition.headers.get("access-control-allow-origin")).toBe("*");
    expect(await definition.json()).toMatchObject({
        kind: REMOTE_INTEGRATION_KIND,
        version: REMOTE_INTEGRATION_VERSION,
    });
    const response = await fetch(`${baseUrl}/api/integrations/package?${params}`, { credentials: "omit" });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER)).toMatch(/^[a-f0-9]{64}$/);
    expect(await response.json()).toMatchObject({ kind: REMOTE_INTEGRATION_KIND, version: REMOTE_INTEGRATION_VERSION });
}

export async function assertDelivery(fixture: FixtureProcess): Promise<void> {
    const base = `http://127.0.0.1:${fixture.ready.deliveryPort}`;
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, pid: fixture.ready.pid });
    expect((await fetch(`${base}/robots.txt`)).status).toBe(200);
}

export async function postControl(fixture: FixtureProcess, path: string, body: unknown): Promise<InstallationResponse> {
    const response = await postControlResponse(fixture, path, body);
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as InstallationResponse;
}

export async function postControlResponse(fixture: FixtureProcess, path: string, body: unknown): Promise<Response> {
    return await fetch(`http://127.0.0.1:${fixture.ready.controlPort}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function getControl(fixture: FixtureProcess, path: string): Promise<Record<string, unknown>> {
    const response = await fetch(`http://127.0.0.1:${fixture.ready.controlPort}${path}`);
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as Record<string, unknown>;
}

export async function assertRemoteDeployments(path: string, pid: number, includeInitial: boolean): Promise<void> {
    const events = await eventsForPid(path, pid);
    const sql = events.filter((event) => event.type === "sql").map((event) => String(event.query));
    const functions = JSON.stringify(events.filter((event) => event.type === "function"));
    expect(sql.some((query) => query.includes(`${REMOTE_SQL_MARKER}_upgrade`))).toBe(true);
    expect(functions).toContain(REMOTE_UPGRADE_MARKER);
    if (includeInitial) {
        expect(sql.some((query) => query.includes(REMOTE_SQL_MARKER) && !query.includes("_upgrade"))).toBe(true);
        expect(functions).toContain(REMOTE_FUNCTION_MARKER);
    }
}

export async function assertPersistedPin(path: string, digest: string): Promise<void> {
    const [installation] = JSON.parse(await readFile(path, "utf8")) as Array<Record<string, unknown>>;
    expect(installation).toMatchObject({ definitionVersion: REMOTE_UPGRADE_VERSION, packageDigest: digest });
    expect(installation?.definitionSnapshot).toEqual(REMOTE_UPGRADE_DEFINITION);
}

export async function corruptPinnedObject(cacheRoot: string, digest: string): Promise<void> {
    const definition = join(cacheRoot, "objects", "sha256", digest, "root", "definition.json");
    await chmod(definition, 0o640);
    await writeFile(definition, "corrupt\n", "utf8");
}

export async function eventsForPid(path: string, pid: number): Promise<Array<Record<string, unknown>>> {
    try {
        return (await readFile(path, "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Record<string, unknown>)
            .filter((event) => event.pid === pid);
    } catch (error) {
        return isNodeError(error, "ENOENT") ? [] : Promise.reject(error);
    }
}

export async function makeOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    await chmod(path, metadata.isDirectory() ? 0o700 : 0o600);
    if (metadata.isDirectory()) {
        const directory = await opendir(path);
        for await (const entry of directory) {
            await makeOwnerWritable(join(path, entry.name));
        }
    }
}

function isNodeError(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
