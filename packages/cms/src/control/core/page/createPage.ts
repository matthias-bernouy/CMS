import type { ControlCms } from 'src/control/ControlCms';
import type { PageCreateDto } from '../validation/page/parseCreateDto';

export async function createPage(cms: ControlCms, dto: PageCreateDto): Promise<void> {
    await cms.repository.insertPage(dto.path, dto.title);
}
