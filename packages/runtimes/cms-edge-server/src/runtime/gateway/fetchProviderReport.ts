import {
    parseProviderRuntimeReportJson,
    type ProviderRuntimeReport,
} from "@bernouy/cms-repository/providers/installations";
import type { InstallationsProviderTransport } from "./InstallationsProviderTransport";

export const INSTALLATIONS_CONTRACT = {
    contractId: "ulvia.cms.installations",
    version: "1.1.0",
    digest: "sha256:59cb12546b9707d8c7f45cd3e0dfc75b1d2213d76d79486c3c38b5cc15baf952",
} as const;

export type InstallationsControlContract = Readonly<{ contractId: string; version: string; digest: string }>;
export function installationsControlContract(report: ProviderRuntimeReport): InstallationsControlContract {
    const supported = [
        INSTALLATIONS_CONTRACT,
        {
            contractId: "ulvia.cms.installations",
            version: "1.0.0",
            digest: "sha256:633e76b7944ece8618602ce20d78ebbeb0f517e632bc40556aec91ccd36d6fa1",
        },
    ];
    for (const contract of supported) {
        if (
            report.implementations.some(
                (candidate) =>
                    candidate.contractId === contract.contractId &&
                    candidate.version === contract.version &&
                    candidate.digest === contract.digest &&
                    candidate.status === "ready",
            )
        ) {
            return contract;
        }
    }
    throw new Error("Installations Provider does not expose the compatible control contract");
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
