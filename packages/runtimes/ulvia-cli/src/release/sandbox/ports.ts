import { createServer } from "node:net";
import type { DevPorts } from "../../runtime/cms";

export type SupabaseSandboxPorts = Readonly<{
    api: number;
    database: number;
    shadow: number;
    pooler: number;
    studio: number;
    smtp: number;
    analytics: number;
    inspector: number;
}>;

export type ReleaseSandboxPorts = Readonly<{
    cms: DevPorts;
    supabase: SupabaseSandboxPorts;
}>;

export async function allocateReleaseSandboxPorts(): Promise<ReleaseSandboxPorts> {
    const reservations = await Promise.all(Array.from({ length: 13 }, reservePort));
    const ports = reservations.map((reservation) => reservation.port);
    await Promise.all(reservations.map((reservation) => reservation.close()));
    return {
        cms: {
            control: ports[0]!,
            delivery: ports[1]!,
            repository: ports[2]!,
            supabaseManagement: ports[3]!,
            mongo: ports[4]!,
        },
        supabase: {
            api: ports[5]!,
            database: ports[6]!,
            shadow: ports[7]!,
            pooler: ports[8]!,
            studio: ports[9]!,
            smtp: ports[10]!,
            analytics: ports[11]!,
            inspector: ports[12]!,
        },
    };
}

async function reservePort(): Promise<Readonly<{ port: number; close(): Promise<void> }>> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Could not reserve a loopback port for release verification");
    }
    return {
        port: address.port,
        close: async () => {
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        },
    };
}
