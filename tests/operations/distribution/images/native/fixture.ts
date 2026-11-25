import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../../../../../infra/process";
import type { ImageArtifact } from "../../../../../infra/images/inspection";
import type { ImageRegistryTransport } from "../../../../../infra/images/registry";

const REGISTRY = "registry@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e";

/** Actual Docker uploads stay on loopback; public registry coordinates are redirected by the test transport. */
export async function nativeRegistryFixture() {
    const token = randomUUID();
    const name = `ulvia-identity-${token}`;
    const version = `0.0.0-identity-${token}`;
    const reference = `docker.io/cyaxis/ulvia-edge:${version}`;
    const directory = await mkdtemp(join(tmpdir(), "ulvia-identity-"));
    let localReference: string | undefined;
    async function close() {
        await Promise.allSettled([
            command(["docker", "rm", "--force", name], { capture: true }),
            command(["docker", "image", "rm", reference, ...(localReference ? [localReference] : [])], {
                capture: true,
            }),
            rm(directory, { recursive: true, force: true }),
        ]);
    }
    try {
        await command(["docker", "run", "--detach", "--rm", "--name", name, "--publish", "127.0.0.1::5000", REGISTRY], {
            capture: true,
        });
        const address = (await command(["docker", "port", name, "5000/tcp"], { capture: true })).trim();
        if (!/^127\.0\.0\.1:[0-9]+$/u.test(address)) {
            throw new Error("Test registry did not bind exclusively to loopback");
        }
        const origin = `http://${address}`;
        localReference = `${address}/cyaxis/ulvia-edge:${version}`;
        const deadline = Date.now() + 15_000;
        while (true) {
            try {
                const response = await fetch(`${origin}/v2/`, { signal: AbortSignal.timeout(1000) });
                await response.body?.cancel();
                if (response.ok) {
                    break;
                }
            } catch {
                // The container can exist before the registry starts listening.
            }
            if (Date.now() >= deadline) {
                throw new Error("Test registry did not become ready");
            }
            await Bun.sleep(100);
        }
        await Bun.write(join(directory, "Dockerfile"), "FROM scratch\nCOPY identity /identity\n");
        await Bun.write(join(directory, "identity"), token);
        await command(["docker", "build", "--provenance=mode=min", "--tag", reference, directory], { capture: true });
        const id = (
            await command(["docker", "image", "inspect", "--format", "{{.Id}}", reference], { capture: true })
        ).trim();
        await command(["docker", "tag", reference, localReference]);
        const image: ImageArtifact = { component: "edge", reference, id };
        let pushes = 0;
        const transport: ImageRegistryTransport = {
            fetch: async (url, init) => {
                const target = new URL(url);
                if (target.origin === "https://auth.docker.io") {
                    return Response.json({ token: "local-test-grant" });
                }
                if (
                    target.origin !== "https://registry-1.docker.io" ||
                    !target.pathname.startsWith("/v2/cyaxis/ulvia-edge/manifests/")
                ) {
                    throw new Error("Unexpected test registry request");
                }
                const headers = new Headers(init.headers);
                headers.delete("authorization");
                return fetch(`${origin}${target.pathname}`, { ...init, headers });
            },
            run: async (args, options) => {
                if (args.join(" ") === `docker push ${reference}`) {
                    pushes++;
                    return command(["docker", "push", localReference!], options);
                }
                if (args.join(" ") === `docker image inspect --format {{.Id}} ${reference}`) {
                    return command(args, options);
                }
                throw new Error("Unexpected Docker test command");
            },
        };
        return { image, transport, close, pushes: () => pushes };
    } catch (error) {
        await close();
        throw error;
    }
}
