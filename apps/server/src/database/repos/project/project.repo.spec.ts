import { ProjectRepo } from './project.repo';

describe('ProjectRepo', () => {
  const workspaceId = 'workspace-1';
  const projectId = 'project-1';

  it('inserts a project and returns the inserted row', async () => {
    const project = { id: projectId, workspaceId, name: 'Website' };
    const executeTakeFirstOrThrow = jest.fn().mockResolvedValue(project);
    const returningAll = jest.fn().mockReturnValue({ executeTakeFirstOrThrow });
    const values = jest.fn().mockReturnValue({ returningAll });
    const db = { insertInto: jest.fn().mockReturnValue({ values }) };
    const repo = new ProjectRepo(db as any);

    await expect(
      repo.create({
        workspaceId,
        clientId: 'client-1',
        spaceId: 'space-1',
        name: 'Website',
        createdById: 'user-1',
      }),
    ).resolves.toEqual(project);
    expect(db.insertInto).toHaveBeenCalledWith('projects');
  });

  it('soft-deletes only the requested project in its workspace', async () => {
    const executeTakeFirst = jest.fn().mockResolvedValue({ id: projectId });
    const whereDeletedAt = jest.fn().mockReturnValue({ executeTakeFirst });
    const whereWorkspace = jest.fn().mockReturnValue({ where: whereDeletedAt });
    const whereId = jest.fn().mockReturnValue({ where: whereWorkspace });
    const returningAll = jest.fn().mockReturnValue({ where: whereId });
    const set = jest.fn().mockReturnValue({ returningAll });
    const db = { updateTable: jest.fn().mockReturnValue({ set }) };
    const repo = new ProjectRepo(db as any);

    await repo.archive(projectId, workspaceId);

    expect(db.updateTable).toHaveBeenCalledWith('projects');
    expect(whereId).toHaveBeenCalledWith('id', '=', projectId);
    expect(whereWorkspace).toHaveBeenCalledWith('workspaceId', '=', workspaceId);
    expect(whereDeletedAt).toHaveBeenCalledWith('deletedAt', 'is', null);
  });
});
