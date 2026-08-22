import { ClientRepo } from './client.repo';

describe('ClientRepo', () => {
  const workspaceId = 'workspace-1';
  const clientId = 'client-1';

  it('inserts a client and returns the inserted row', async () => {
    const client = { id: clientId, workspaceId, name: 'Acme' };
    const executeTakeFirstOrThrow = jest.fn().mockResolvedValue(client);
    const returningAll = jest.fn().mockReturnValue({ executeTakeFirstOrThrow });
    const values = jest.fn().mockReturnValue({ returningAll });
    const db = { insertInto: jest.fn().mockReturnValue({ values }) };
    const repo = new ClientRepo(db as any);

    await expect(
      repo.create({ workspaceId, name: 'Acme', createdById: 'user-1' }),
    ).resolves.toEqual(client);
    expect(db.insertInto).toHaveBeenCalledWith('clients');
  });

  it('soft-deletes only the requested client in its workspace', async () => {
    const executeTakeFirst = jest.fn().mockResolvedValue({ id: clientId });
    const whereDeletedAt = jest.fn().mockReturnValue({ executeTakeFirst });
    const whereWorkspace = jest.fn().mockReturnValue({ where: whereDeletedAt });
    const whereId = jest.fn().mockReturnValue({ where: whereWorkspace });
    const returningAll = jest.fn().mockReturnValue({ where: whereId });
    const set = jest.fn().mockReturnValue({ returningAll });
    const db = { updateTable: jest.fn().mockReturnValue({ set }) };
    const repo = new ClientRepo(db as any);

    await repo.archive(clientId, workspaceId);

    expect(db.updateTable).toHaveBeenCalledWith('clients');
    expect(whereId).toHaveBeenCalledWith('id', '=', clientId);
    expect(whereWorkspace).toHaveBeenCalledWith('workspaceId', '=', workspaceId);
    expect(whereDeletedAt).toHaveBeenCalledWith('deletedAt', 'is', null);
  });
});
