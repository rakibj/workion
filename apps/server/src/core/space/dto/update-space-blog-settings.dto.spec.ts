import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSpaceBlogSettingsDto } from './update-space-blog-settings.dto';

describe('UpdateSpaceBlogSettingsDto', () => {
  const spaceId = 'de7d0afc-ffbe-4e4b-a658-15829e419ba2';

  it('treats a blank base path as the domain root', async () => {
    const dto = plainToInstance(UpdateSpaceBlogSettingsDto, {
      spaceId,
      domain: 'example.com',
      basePath: '  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.basePath).toBeUndefined();
  });

  it('accepts one path segment and rejects nested paths', async () => {
    const valid = plainToInstance(UpdateSpaceBlogSettingsDto, {
      spaceId,
      domain: 'example.com',
      basePath: '/blogs',
    });
    const invalid = plainToInstance(UpdateSpaceBlogSettingsDto, {
      spaceId,
      domain: 'example.com',
      basePath: '/blogs/archive',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
