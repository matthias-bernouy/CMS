import type { ControlCms } from "src/control/ControlCms";
import InvalidParam from "src/control/errors/Http/InvalidParam";
import { getResolverFor } from "src/control/core/data/getResolverFor";
import type { TDataMockup } from "src/socle/interfaces/Data/data";
import type { DataMockupCreateDto } from "../validation/dataMockup/parseCreateDto";

export async function createMockup(cms: ControlCms, dto: DataMockupCreateDto): Promise<TDataMockup> {
    const provider = await cms.repository.getDataProvider(dto.providerId);
    if (!provider) throw new InvalidParam("providerId", "Unknown provider.");

    const resolver = await getResolverFor(cms, dto.providerId);
    if (!resolver) throw new InvalidParam("providerId", "Provider has no synced spec.");

    if (!resolver.getEndpoint(`${dto.method} ${dto.path}`)) {
        throw new InvalidParam("path", `Operation "${dto.method} ${dto.path}" does not exist in the spec.`);
    }

    return cms.repository.createMockup({
        providerId: dto.providerId,
        method:     dto.method,
        path:       dto.path,
        name:       dto.name,
        status:     dto.status,
        body:       dto.body,
    });
}
