import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PROJECT_STATUSES } from './project-status';
import { UpdateProjectDto } from './update-project.dto';

describe('UpdateProjectDto', () => {
  it.each(PROJECT_STATUSES)('accepts the %s project status', (status) => {
    const dto = plainToInstance(UpdateProjectDto, { status });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an unsupported project status', () => {
    const dto = plainToInstance(UpdateProjectDto, { status: 'cancelled' });
    expect(validateSync(dto)).not.toHaveLength(0);
  });
});
