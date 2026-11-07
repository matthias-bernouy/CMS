import type { Socket } from "node:net";
import { Agent as HttpAgent, type RequestOptions, type ClientRequest } from "node:http";
import { Agent as HttpsAgent } from "node:https";

const options = { keepAlive: true, maxSockets: 16, maxTotalSockets: 64, maxFreeSockets: 4 };

function authority(request: RequestOptions): string {
    const headers = request.headers;
    const host = headers && !Array.isArray(headers) && "host" in headers ? headers.host : undefined;
    if (typeof host !== "string" || !host) {
        throw new TypeError("Pinned connection requires an explicit Host authority");
    }
    return host;
}

class PinnedHttpAgent extends HttpAgent {
    override keepSocketAlive(socket: Socket): boolean {
        const keep: unknown = super.keepSocketAlive(socket);
        if (keep === false) {
            return false;
        }
        socket.setTimeout(10_000);
        return true;
    }
    override reuseSocket(socket: Socket, request: ClientRequest): void {
        socket.setTimeout(0);
        super.reuseSocket(socket, request);
    }
    override getName(request: RequestOptions): string {
        return `${super.getName(request)}\0${authority(request)}`;
    }
}

class PinnedHttpsAgent extends HttpsAgent {
    override keepSocketAlive(socket: Socket): boolean {
        const keep: unknown = super.keepSocketAlive(socket);
        if (keep === false) {
            return false;
        }
        socket.setTimeout(10_000);
        return true;
    }
    override reuseSocket(socket: Socket, request: ClientRequest): void {
        socket.setTimeout(0);
        super.reuseSocket(socket, request);
    }
    override getName(request: RequestOptions): string {
        return `${super.getName(request)}\0${authority(request)}`;
    }
}

/** Pool only sockets: DNS policy and invocation authorization still run before every exchange. */
export const pinnedHttpAgent = new PinnedHttpAgent(options);
export const pinnedHttpsAgent = new PinnedHttpsAgent(options);
