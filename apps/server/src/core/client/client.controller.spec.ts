import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientController } from './client.controller';
import { ClientService } from './services/client.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('ClientController', () => {
  let controller: ClientController;
  let clientService: jest.Mocked<Partial<ClientService>>;

  const user = { id: 'user-1' } as any;
  const workspace = { id: 'workspace-1' } as any;

  beforeEach(async () => {
    clientService = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      linkSpace: jest.fn(),
      unlinkSpace: jest.fn(),
      getBySpace: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [{ provide: ClientService, useValue: clientService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ClientController);
  });

  it('creates a client in the authenticated workspace', async () => {
    (clientService.create as jest.Mock).mockResolvedValue({ id: 'client-1' });

    await expect(
      controller.create({ name: 'Acme', spaceId: 'space-1' }, user, workspace),
    ).resolves.toEqual({ id: 'client-1' });
    expect(clientService.create).toHaveBeenCalledWith(user, workspace.id, {
      name: 'Acme',
      spaceId: 'space-1',
    });
  });

  it('preserves a forbidden response from the service', async () => {
    (clientService.update as jest.Mock).mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      controller.update('client-1', { name: 'New name' }, user, workspace),
    ).rejects.toThrow(ForbiddenException);
  });

  it('preserves a not-found response from the service', async () => {
    (clientService.get as jest.Mock).mockRejectedValue(
      new NotFoundException('Client not found'),
    );

    await expect(controller.get('missing', user, workspace)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the client linked to a space', async () => {
    (clientService.getBySpace as jest.Mock).mockResolvedValue({
      id: 'client-1',
    });

    await expect(
      controller.getBySpace('space-1', user, workspace),
    ).resolves.toEqual({ id: 'client-1' });
    expect(clientService.getBySpace).toHaveBeenCalledWith(
      user,
      workspace.id,
      'space-1',
    );
  });

  it('preserves a forbidden response from the client-by-space lookup', async () => {
    (clientService.getBySpace as jest.Mock).mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      controller.getBySpace('space-1', user, workspace),
    ).rejects.toThrow(ForbiddenException);
  });
});
