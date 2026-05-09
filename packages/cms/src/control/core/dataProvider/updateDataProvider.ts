import type { ControlCms } from 'src/control/ControlCms';
import type { TDataProvider } from 'src/socle/interfaces/Data/data';
import type { DataProviderUpdateDto } from '../validation/dataProvider/parseUpdateDto';
import { publishProxy } from './publishProxy';

export async function updateDataProvider(
    cms: ControlCms,
    id:  string,
    dto: DataProviderUpdateDto,
): Promise<TDataProvider | null> {
    const updated = await cms.repository.updateDataProvider(id, dto);
    if (updated) await publishProxy(cms, id);
    return updated;
}
