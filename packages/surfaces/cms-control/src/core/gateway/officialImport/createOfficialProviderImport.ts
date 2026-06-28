import type { ControlCms } from "cms-control/ControlCms";
import { DuplicateSourceError, makeSourceUrn } from "@bernouy/cms-sources";
import type { OfficialProviderImportDto } from "cms-control/core/validation/gateway/parseOfficialProviderImportDto";
import { OFFICIAL_PROVIDER_IMPORTERS } from "./importers";
import type { OfficialProviderImportResult } from "./types";

export async function createOfficialProviderImport(cms: ControlCms, dto: OfficialProviderImportDto): Promise<void> {
    const sourceUrn = makeSourceUrn(dto.id);
    if (await cms.sources.getSource(sourceUrn)) throw new DuplicateSourceError(sourceUrn);

    const result = await importOfficialProvider(dto);
    for (const secret of result.secrets) {
        await cms.secrets.set(secret.key, secret.value);
    }
    await cms.sources.createSource(result.source);
}

function importOfficialProvider(dto: OfficialProviderImportDto): Promise<OfficialProviderImportResult> {
    switch (dto.kind) {
        case "supabase":
            return OFFICIAL_PROVIDER_IMPORTERS.supabase(dto);
    }
}
