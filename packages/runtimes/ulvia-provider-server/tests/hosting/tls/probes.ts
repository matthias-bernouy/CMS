import { connect } from "node:tls";

export function certificateSerial(host: string, servername: string, ca: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = connect({ host, port: 443, servername, ca, rejectUnauthorized: true });
        const timeout = setTimeout(() => socket.destroy(new Error("TLS serial probe timed out")), 5000);
        socket.once("secureConnect", () => {
            const serial = socket.getPeerCertificate().serialNumber;
            socket.destroy();
            if (serial) {
                resolve(serial);
            } else {
                reject(new Error("Missing certificate serial"));
            }
        });
        socket.once("error", reject);
        socket.once("close", () => clearTimeout(timeout));
    });
}

export async function proxyReady(url: string, ca: string): Promise<Response> {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const response = await fetch(url, { tls: { ca }, signal: AbortSignal.timeout(5000) });
        if (response.status !== 503) {
            return response;
        }
        await response.body?.cancel();
        if (Date.now() >= deadline) {
            throw new Error("Shared upstream health did not become ready after TLS initialization");
        }
        await Bun.sleep(100);
    }
}
