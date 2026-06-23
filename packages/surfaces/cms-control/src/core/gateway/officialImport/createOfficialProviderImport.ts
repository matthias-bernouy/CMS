import type { ControlCms } from "cms-control/ControlCms";
import { DuplicateProviderError, makeProviderUrn } from "@bernouy/cms-gateway";
import type { OfficialProviderImportDto } from "cms-control/core/validation/gateway/parseOfficialProviderImportDto";
import { OFFICIAL_PROVIDER_IMPORTERS } from "./importers";
import type { OfficialProviderImportResult } from "./types";

export async function createOfficialProviderImport(cms: ControlCms, dto: OfficialProviderImportDto): Promise<void> {
    const providerUrn = makeProviderUrn(dto.id);
    if (await cms.gateway.getProvider(providerUrn)) throw new DuplicateProviderError(providerUrn);

    const result = await importOfficialProvider(dto);
    for (const secret of result.secrets) {
        await cms.secrets.set(secret.key, secret.value);
    }
    await cms.gateway.createProvider(result.provider);
}

function importOfficialProvider(dto: OfficialProviderImportDto): Promise<OfficialProviderImportResult> {
    switch (dto.kind) {
        case "supabase":
            return OFFICIAL_PROVIDER_IMPORTERS.supabase(dto);
    }
}
