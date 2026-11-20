import { expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { connectBrowser } from "../../../../../../tests/integration/instance/oauth";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";
import type { HostedSite } from "./setup";

export async function startNativeSmokeWorker() {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-smoke-capture-"));
    const socket = join(directory, "worker.sock");
    const child = Bun.spawn(
        [
            process.execPath,
            "--no-macros",
            "run",
            resolve(import.meta.dir, "../../../src/index.ts"),
            "capture-worker",
            "--socket",
            socket,
            "--browser-path",
            chromium.executablePath(),
        ],
        { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdout: "ignore", stderr: "pipe" },
    );
    const stderr = new Response(child.stderr).text();
    const close = async () => {
        child.kill("SIGTERM");
        const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
        try {
            await child.exited;
        } finally {
            clearTimeout(timeout);
            await rm(directory, { recursive: true, force: true });
        }
    };
    try {
        const until = Date.now() + 15_000;
        while (Date.now() < until) {
            const response = await fetch("http://capture.local/readyz", { unix: socket }).catch(() => null);
            if (response?.status === 204) {
                return { directory, group: String(process.getgid!()), close };
            }
            await response?.body?.cancel();
            await Bun.sleep(100);
        }
        throw new Error("Native smoke capture worker did not become ready");
    } catch (cause) {
        await close();
        throw new Error(`${String(cause)}: ${await stderr}`);
    }
}

export async function verifyNativeMcpCaptures(site: HostedSite, foreign: HostedSite) {
    const connection = await connectBrowser(site.origin, site.administrator);
    let draft: { id: string; revision: number } | undefined;
    try {
        const listed = await connection.call("ulvia/cms.content", "pages.list", { limit: 25 });
        const page = await connection.call("ulvia/cms.content", "pages.get", { id: listed.items[0].id });
        draft = await connection.call("ulvia/cms.content", "pages.create", {
            path: "/native-capture-draft",
            title: "Native capture draft",
            content: page.content,
        });
        for (const width of [390, 960]) {
            const metadata = await connection.call("ulvia/cms.content", "pages.capture", {
                id: draft!.id,
                expectedRevision: draft!.revision,
                locale: "en",
                options: { width, height: 600, mode: "viewport", themeMode: "light" },
            });
            const tool = connection.tools.find(
                (tool) =>
                    tool._meta["io.ulvia/contract"] === "ulvia/cms.content" &&
                    tool._meta["io.ulvia/capability"] === "captures.image",
            )!;
            const response = await connection.rpc("tools/call", {
                name: tool.name,
                arguments: { input: { captureId: metadata.captureId } },
            });
            expect(response.isError).not.toBeTrue();
            const image = response.content.find((item: { type: string }) => item.type === "image");
            expect(image.mimeType).toBe("image/png");
            const bytes = Buffer.from(image.data, "base64");
            expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, 600]);
            expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(metadata.digest);
            const other = repositoryApi(foreign.origin);
            const actor = await other.session(foreign.administrator.email, foreign.administrator.password);
            const refused = await other.request(
                "ulvia/cms.content",
                `/captures/image?captureId=${metadata.captureId}`,
                "GET",
                undefined,
                actor,
            );
            expect(refused.status).toBe(404);
            await refused.body?.cancel();
        }
        const current = await connection.call("ulvia/cms.content", "pages.get", { id: draft!.id });
        expect(current.visible).toBeFalse();
        expect(current.revision).toBe(draft!.revision);
    } finally {
        try {
            if (draft) {
                await connection.call("ulvia/cms.content", "pages.delete", {
                    id: draft.id,
                    expectedRevision: draft.revision,
                });
            }
        } finally {
            await connection.browser.close();
        }
    }
}
