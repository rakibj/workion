import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProjectController } from './project.controller';
import { ProjectService } from './services/project.service';

describe('ProjectController', () => {
  let controller: ProjectController;
  let projectService: jest.Mocked<Partial<ProjectService>>;
  const user = { id: 'user-1' } as any;
  const workspace = { id: 'workspace-1' } as any;

  beforeEach(async () => {
    projectService = { create: jest.fn(), get: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [{ provide: ProjectService, useValue: projectService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ProjectController);
  });

  it('creates a project in the authenticated workspace', async () => {
    (projectService.create as jest.Mock).mockResolvedValue({ id: 'project-1' });
    const dto = { clientId: 'client-1', spaceId: 'space-1', name: 'Website' };

    await expect(controller.create(dto, user, workspace)).resolves.toEqual({
      id: 'project-1',
    });
    expect(projectService.create).toHaveBeenCalledWith(user, workspace.id, dto);
  });

  it('preserves service permission and not-found failures', async () => {
    (projectService.get as jest.Mock)
      .mockRejectedValueOnce(new ForbiddenException())
      .mockRejectedValueOnce(new NotFoundException('Project not found'));

    await expect(controller.get('project-1', user, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(controller.get('missing', user, workspace)).rejects.toThrow(
      NotFoundException,
    );
  });
});
