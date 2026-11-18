import { createServer } from "node:net";
import { smtpState } from "./state";
import { smtpSession } from "./session";
import type { Socket } from "node:net";

export async function controlledSmtp(options: {
    hostname: string;
    smtpPort: number;
    httpPort: number;
    key: string;
    username: string;
    password: string;
}) {
    if (options.key.length < 32 || options.password.length < 32 || !options.username) {
        throw new Error("SMTP fixture requires private control and transport credentials");
    }
    const state = smtpState();
    const sockets = new Set<Socket>();
    const smtp = createServer((socket) => {
        if (sockets.size >= 16) {
            socket.destroy();
            return;
        }
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        smtpSession(socket, state, options.username, options.password);
    });
    smtp.maxConnections = 16;
    await new Promise<void>((resolve, reject) => {
        smtp.once("error", reject);
        smtp.listen(options.smtpPort, options.hostname, () => {
            smtp.off("error", reject);
            resolve();
        });
    });
    smtp.on("error", () => {});
    const stop = async () => {
        for (const socket of sockets) {
            socket.destroy();
        }
        await new Promise<void>((resolve) => smtp.close(() => resolve()));
    };
    let http: ReturnType<typeof Bun.serve>;
    try {
        http = Bun.serve({
            hostname: options.hostname,
            port: options.httpPort,
            maxRequestBodySize: 1024,
            fetch(request) {
                const url = new URL(request.url);
                if (url.pathname === "/readyz" && request.method === "GET") {
                    return new Response(null);
                }
                if (request.headers.get("authorization") !== `Bearer ${options.key}`) {
                    return new Response(null, { status: 403 });
                }
                const recipient = url.searchParams.get("recipient") ?? "";
                try {
                    if (url.pathname === "/mailbox" && request.method === "GET") {
                        return Response.json(state.read(recipient));
                    }
                    if (url.pathname === "/counts" && request.method === "GET") {
                        return Response.json(state.read(recipient).counts);
                    }
                    if (url.pathname === "/mailbox" && request.method === "DELETE") {
                        state.remove(recipient);
                        return Response.json({ removed: true });
                    }
                    return new Response(null, { status: 404 });
                } catch {
                    return new Response(null, { status: 422 });
                }
            },
        });
    } catch (error) {
        await stop();
        throw error;
    }
    const address = smtp.address();
    if (!address || typeof address === "string") {
        await http.stop(true);
        await stop();
        throw new Error("No SMTP fixture port");
    }
    return {
        smtpPort: address.port,
        url: `http://${options.hostname}:${http.port}`,
        async close() {
            await http.stop(true);
            await stop();
        },
    };
}

if (import.meta.main) {
    await controlledSmtp({
        hostname: "0.0.0.0",
        smtpPort: 2525,
        httpPort: 8054,
        key: process.env.ULVIA_TEST_SMTP_KEY ?? "",
        username: "performance",
        password: process.env.ULVIA_TEST_SMTP_PASSWORD ?? "",
    });
}
