import type { ControlCms } from "cms-control/ControlCms";
import { SpecParseError } from "@bernouy/cms-gateway";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { createOfficialProviderImport } from "cms-control/core/gateway/officialImport/createOfficialProviderImport";
import { parseOfficialProviderImportDto } from "cms-control/core/validation/gateway/parseOfficialProviderImportDto";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** POST /api/gateway-provider/official-import — guided imports for known
 * providers. V1 supports Supabase: credentials stay server-side as a secret,
 * then the fetched OpenAPI spec is translated into a gateway provider. */
export default async function postOfficialProviderImport(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto = parseOfficialProviderImportDto(body);
    try {
        await createOfficialProviderImport(cms, dto);
    } catch (error) {
        if (error instanceof SpecParseError) throw new InvalidParam("openapi", error.message);
        throw error;
    }
    return new Response();
}
