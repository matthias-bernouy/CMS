import type { ControlCms } from 'src/control/ControlCms';
import type { TDataProvider } from 'src/socle/interfaces/Data/data';
import type { DataProviderUpdateDto } from '../validation/dataProvider/parseUpdateDto';

export async function updateDataProvider(
    cms: ControlCms,
    id:  string,
    dto: DataProviderUpdateDto,
): Promise<TDataProvider | null> {
    return cms.repository.updateDataProvider(id, dto);
}
