import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BlogCustomFieldType,
  UpdateSpaceBlogSettingsDto,
} from './update-space-blog-settings.dto';

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

  it('accepts a valid custom field schema', async () => {
    const dto = plainToInstance(UpdateSpaceBlogSettingsDto, {
      spaceId,
      customFields: [
        { key: 'isFeatured', label: 'Featured', type: BlogCustomFieldType.BOOLEAN },
        { key: 'priority', label: 'Priority', type: BlogCustomFieldType.NUMBER },
      ],
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a custom field key with invalid characters', async () => {
    const dto = plainToInstance(UpdateSpaceBlogSettingsDto, {
      spaceId,
      customFields: [{ key: 'Is Featured!', label: 'Featured', type: BlogCustomFieldType.BOOLEAN }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an unknown custom field type', async () => {
    const dto = plainToInstance(UpdateSpaceBlogSettingsDto, {
      spaceId,
      customFields: [{ key: 'priority', label: 'Priority', type: 'array' }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
