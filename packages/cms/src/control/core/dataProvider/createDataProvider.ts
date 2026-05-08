import type { ControlCms } from 'src/control/ControlCms';
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { DataProviderCreateDto } from '../validation/dataProvider/parseCreateDto';

export async function createDataProvider(cms: ControlCms, dto: DataProviderCreateDto): Promise<void> {
    const existing = await cms.repository.getDataProvider(dto.id);
    if (existing) {
        throw new InvalidParam('id', `"${dto.id}" is already used by another provider.`);
    }

    await cms.repository.createDataProvider({
        id:        dto.id,
        source:    dto.source,
        sourceUrl: dto.sourceUrl,
        server:    '',          // populated by sync from spec.servers[0].url
        spec:      '',
        auth:      dto.auth,
    });
}
