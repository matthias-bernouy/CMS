import { isolatedOrigin, responseBytes } from "../../transport/http";
import { ClientFailure } from "../../clients/failure";
import type { DnsCounts } from "./state";

export function dnsControl(origin: string, key: string) {
    isolatedOrigin(origin);
    const call = async (path: string, method: string, input?: unknown) => {
        const response = await fetch(`${origin}${path}`, {
            method,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
            headers: { authorization: `Bearer ${key}`, ...(input ? { "content-type": "application/json" } : {}) },
            ...(input ? { body: JSON.stringify(input) } : {}),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new ClientFailure("fixture-dns-control-refused");
        }
        return JSON.parse(new TextDecoder().decode(await responseBytes(response, 16 * 1024)));
    };
    const path = (endpoint: string, name: string, type: string) => `${endpoint}?${new URLSearchParams({ name, type })}`;
    return {
        async put(name: string, value: string, type: "TXT" | "A" = "TXT") {
            await call("/records", "PUT", { name, value, type });
        },
        async remove(name: string, type: "TXT" | "A" | "AAAA" = "TXT") {
            await call(path("/records", name, type), "DELETE");
        },
        async counts(name: string, type: "TXT" | "A" | "AAAA" = "TXT"): Promise<DnsCounts> {
            const value = await call(path("/counts", name, type), "GET");
            if (
                ![value.requests, value.requestBytes, value.responseBytes].every(
                    (entry) => Number.isSafeInteger(entry) && entry >= 0,
                )
            ) {
                throw new ClientFailure("fixture-dns-counts-invalid");
            }
            return value;
        },
    };
}

export type DnsControl = ReturnType<typeof dnsControl>;
