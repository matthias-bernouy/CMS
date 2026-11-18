import { createSocket } from "node:dgram";
import { dnsQuestion, dnsReply } from "./wire";
import { dnsState } from "./state";

export async function controlledDns(options: { hostname: string; dnsPort: number; httpPort: number; key: string }) {
    if (options.key.length < 32) {
        throw new Error("DNS fixture control needs a private key");
    }
    const state = dnsState();
    const socket = createSocket("udp4");
    socket.on("message", (query, source) => {
        const question = dnsQuestion(query);
        if (!question) {
            return;
        }
        const reply = dnsReply(query, question, state.get(question.name, question.type), state.hasName(question.name));
        try {
            state.record(question.name, question.type, query.length, reply.length);
        } catch {
            return;
        }
        socket.send(reply, source.port, source.address, () => {});
    });
    try {
        await new Promise<void>((resolve, reject) => {
            socket.once("error", reject);
            socket.bind(options.dnsPort, options.hostname, () => {
                socket.off("error", reject);
                resolve();
            });
        });
    } catch (error) {
        try {
            socket.close();
        } catch {
            /* An unsuccessful bind may already have closed the socket. */
        }
        throw error;
    }
    socket.on("error", () => {});
    let http: ReturnType<typeof Bun.serve>;
    try {
        http = Bun.serve({
            hostname: options.hostname,
            port: options.httpPort,
            maxRequestBodySize: 4096,
            async fetch(request) {
                const url = new URL(request.url);
                if (url.pathname === "/readyz" && request.method === "GET") {
                    return new Response(null);
                }
                if (request.headers.get("authorization") !== `Bearer ${options.key}`) {
                    return new Response(null, { status: 403 });
                }
                const name = url.searchParams.get("name") ?? "";
                const type =
                    url.searchParams.get("type") === "A" ? 1 : url.searchParams.get("type") === "AAAA" ? 28 : 16;
                try {
                    if (url.pathname === "/records" && request.method === "PUT") {
                        state.put(await request.json());
                        return Response.json({ stored: true });
                    }
                    if (url.pathname === "/records" && request.method === "DELETE") {
                        state.remove(name, type);
                        return Response.json({ removed: true });
                    }
                    if (url.pathname === "/counts" && request.method === "GET") {
                        return Response.json(state.count(name, type));
                    }
                    return new Response(null, { status: 404 });
                } catch {
                    return new Response(null, { status: 422 });
                }
            },
        });
    } catch (error) {
        socket.close();
        throw error;
    }
    return {
        dnsPort: socket.address().port,
        url: `http://${options.hostname}:${http.port}`,
        async close() {
            await http.stop(true);
            await new Promise<void>((resolve) => socket.close(() => resolve()));
        },
    };
}

if (import.meta.main) {
    await controlledDns({
        hostname: "0.0.0.0",
        dnsPort: 53,
        httpPort: 8053,
        key: process.env.ULVIA_TEST_DNS_KEY ?? "",
    });
}
