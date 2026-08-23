import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClientContactController } from './client-contact.controller';
import { ClientContactService } from './services/client-contact.service';

describe('ClientContactController', () => {
  const user = { id: 'user-1' } as any;
  const workspace = { id: 'workspace-1' } as any;
  let controller: ClientContactController;
  let service: jest.Mocked<Partial<ClientContactService>>;

  beforeEach(async () => {
    service = { list: jest.fn(), create: jest.fn(), update: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [ClientContactController],
      providers: [{ provide: ClientContactService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ClientContactController);
  });

  it('creates a contact in the authenticated workspace', async () => {
    const dto = { name: 'Ada', email: 'ada@example.com' };
    (service.create as jest.Mock).mockResolvedValue({ id: 'contact-1' });
    await expect(
      controller.create('client-1', dto, user, workspace),
    ).resolves.toEqual({
      id: 'contact-1',
    });
    expect(service.create).toHaveBeenCalledWith(
      user,
      workspace.id,
      'client-1',
      dto,
    );
  });

  it('preserves permission and guest identity validation errors', async () => {
    (service.list as jest.Mock).mockRejectedValueOnce(new ForbiddenException());
    (service.update as jest.Mock).mockRejectedValueOnce(
      new BadRequestException(),
    );
    await expect(controller.list('client-1', user, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      controller.update(
        'client-1',
        'contact-1',
        { name: 'Changed' },
        user,
        workspace,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
