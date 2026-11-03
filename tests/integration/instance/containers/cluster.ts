import { randomUUID } from "node:crypto";
import { docker, mappedPort } from "../docker";

/** Applications have only an internal network. Fixed TCP ingress relays expose loopback test ports. */
export async function containerCluster(relayImage: string, fetchPreload?: string) {
    const id = `ulvia-mcp-${randomUUID().slice(0, 8)}`;
    const ingress = `${id}-ingress`;
    const names: string[] = [];
    await docker(["network", "create", "--internal", id]);
    try {
        await docker(["network", "create", ingress]);
    } catch (error) {
        await docker(["network", "rm", id], true);
        throw error;
    }
    return {
        id,
        names,
        async run(name: string, alias: string, image: string, options: string[] = [], args: string[] = []) {
            names.push(name);
            const application = alias !== "mongo";
            const instrumented = fetchPreload && application;
            const publications: string[] = [];
            const runtimeOptions = options.filter((option, index) => {
                if (option === "--publish") {
                    publications.push(options[index + 1]!);
                    return false;
                }
                return options[index - 1] !== "--publish";
            });
            await docker([
                "run",
                "--detach",
                "--init",
                "--name",
                name,
                "--network",
                id,
                "--network-alias",
                alias,
                ...(application
                    ? [
                          "--read-only",
                          "--tmpfs",
                          "/tmp:rw,nosuid,nodev,noexec,size=256m",
                          "--cap-drop",
                          "ALL",
                          "--security-opt",
                          "no-new-privileges:true",
                      ]
                    : []),
                ...runtimeOptions,
                ...(fetchPreload ? ["--no-healthcheck"] : []),
                ...(instrumented ? ["--volume", `${fetchPreload}:/ulvia-test/fetch.ts:ro`] : []),
                image,
                ...(instrumented
                    ? [
                          "bun",
                          "run",
                          "--no-macros",
                          "--preload=/ulvia-test/fetch.ts",
                          alias === "ulvia-provider"
                              ? "packages/runtimes/ulvia-provider-server/src/index.ts"
                              : "packages/runtimes/cms-edge-server/src/index.ts",
                      ]
                    : args),
            ]);
            if (publications.length) {
                const relay = `${name}-ingress`;
                names.push(relay);
                await docker([
                    "create",
                    "--no-healthcheck",
                    "--name",
                    relay,
                    "--network",
                    ingress,
                    "--read-only",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges:true",
                    ...publications.flatMap((publication) => ["--publish", publication]),
                    "--entrypoint",
                    "bun",
                    relayImage,
                    "-e",
                    relayScript(
                        alias,
                        publications.map((publication) => Number(publication.split(":").at(-1))),
                    ),
                ]);
                await docker(["network", "connect", id, relay]);
                await docker(["start", relay]);
            }
        },
        endpoint(name: string, port: number) {
            return mappedPort(`${name}-ingress`, port);
        },
        async close() {
            if (names.length) {
                await docker(["rm", "--force", "--volumes", ...new Set(names)], true);
            }
            await docker(["network", "rm", ingress], true);
            await docker(["network", "rm", id], true);
        },
    };
}

function relayScript(host: string, ports: number[]): string {
    return `
        const { createServer, connect } = require("node:net");
        for (const port of ${JSON.stringify(ports)}) {
            const server = createServer((incoming) => {
                const outgoing = connect({ host: ${JSON.stringify(host)}, port });
                const close = () => { incoming.destroy(); outgoing.destroy(); };
                incoming.setTimeout(120000, close);
                outgoing.setTimeout(120000, close);
                incoming.on("error", close).on("close", close);
                outgoing.on("error", close).on("close", close);
                incoming.pipe(outgoing).pipe(incoming);
            });
            // Admit the existing 96-request rate-limit burst plus browser keep-alive sockets.
            server.maxConnections = 128;
            server.listen(port, "0.0.0.0");
        }
    `;
}

export type ContainerCluster = Awaited<ReturnType<typeof containerCluster>>;
