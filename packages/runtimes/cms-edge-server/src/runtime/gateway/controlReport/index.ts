import { parseProviderRuntimeReportJson, type ProviderRuntimeReport } from "@bernouy/ulvia-providers/installations";
import type { InstallationsProviderTransport } from "../InstallationsProviderTransport";

import supported from "./supported.json";
export const INSTALLATIONS_CONTRACT = supported[0]!;
const SUPPORTED_CONTROL_CONTRACTS = supported;

export type InstallationsControlContract = Readonly<{ contractId: string; version: string; digest: string }>;
export function installationsControlContract(report: ProviderRuntimeReport): InstallationsControlContract {
    const selected = SUPPORTED_CONTROL_CONTRACTS.find((supported) =>
        report.implementations.some(
            (candidate) =>
                candidate.contractId === supported.contractId &&
                candidate.version === supported.version &&
                candidate.digest === supported.digest &&
                candidate.status === "ready",
        ),
    );
    if (selected) {
        return selected;
    }
    throw new Error("Installations Provider does not expose the required control contract");
}

/** Validates the stable public Provider report before the Edge accepts its control capabilities. */
export async function fetchInstallationsProviderReport(
    transport: InstallationsProviderTransport,
): Promise<ProviderRuntimeReport> {
    const response = await transport.request("/ulvia/report", {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok || !response.body) {
        throw new Error(`Installations Provider report request failed (${response.status})`);
    }
    const report = parseProviderRuntimeReportJson(await readBoundedReport(response));
    installationsControlContract(report);
    return report;
}

async function readBoundedReport(response: Response): Promise<Uint8Array> {
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > 256 * 1024) {
                await reader.cancel();
                throw new Error("Installations Provider report is too large");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
