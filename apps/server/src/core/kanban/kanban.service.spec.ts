import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { KanbanService } from './kanban.service';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { QueueName } from '../../integrations/queue/constants';

describe('KanbanService — categories', () => {
  let service: KanbanService;
  let kanbanRepo: jest.Mocked<Partial<KanbanRepo>>;
  let pageRepo: jest.Mocked<Partial<PageRepo>>;

  const pageId = '00000000-0000-0000-0000-000000000001';
  const categoryId = '00000000-0000-0000-0000-000000000002';
  const optionId = '00000000-0000-0000-0000-000000000003';
  const cardId = '00000000-0000-0000-0000-000000000004';
  const columnId = '00000000-0000-0000-0000-000000000005';
  const userId = '00000000-0000-0000-0000-000000000006';

  beforeEach(async () => {
    kanbanRepo = {
      findCategoryById: jest.fn(),
      getCategoriesByPageId: jest.fn(),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
      getMaxCategoryPosition: jest.fn().mockResolvedValue(0),
      findCategoryOptionById: jest.fn(),
      createCategoryOption: jest.fn(),
      updateCategoryOption: jest.fn(),
      deleteCategoryOption: jest.fn(),
      getMaxCategoryOptionPosition: jest.fn().mockResolvedValue(0),
      setCardCategoryValue: jest.fn(),
      findCardById: jest.fn(),
      findColumnById: jest.fn(),
    };
    pageRepo = {
      findById: jest.fn().mockResolvedValue({ id: pageId, type: 'kanban' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KanbanService,
        { provide: KanbanRepo, useValue: kanbanRepo },
        { provide: PageRepo, useValue: pageRepo },
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: PagePermissionRepo, useValue: {} },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(undefined), useValue: {} },
        {
          provide: getQueueToken(QueueName.NOTIFICATION_QUEUE),
          useValue: { add: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(KanbanService);
  });

  it('creates a category at the end of the page\'s position order', async () => {
    (kanbanRepo.getMaxCategoryPosition as jest.Mock).mockResolvedValue(1000);
    (kanbanRepo.createCategory as jest.Mock).mockResolvedValue({
      id: categoryId,
      pageId,
      name: 'Type',
      icon: 'IconBug',
      position: 2000,
    });

    const result = await service.createCategory(pageId, 'Type', 'IconBug');

    expect(kanbanRepo.createCategory).toHaveBeenCalledWith({
      pageId,
      name: 'Type',
      icon: 'IconBug',
      position: 2000,
    });
    expect(result.name).toBe('Type');
  });

  it('throws NotFoundException updating a category that does not exist', async () => {
    (kanbanRepo.findCategoryById as jest.Mock).mockResolvedValue(undefined);

    await expect(
      service.updateCategory(categoryId, { name: 'Renamed' }),
    ).rejects.toThrow(NotFoundException);
    expect(kanbanRepo.updateCategory).not.toHaveBeenCalled();
  });

  it('deletes a category that exists', async () => {
    (kanbanRepo.findCategoryById as jest.Mock).mockResolvedValue({
      id: categoryId,
      pageId,
    });

    await service.deleteCategory(categoryId);

    expect(kanbanRepo.deleteCategory).toHaveBeenCalledWith(categoryId);
  });

  it('creates a category option under an existing category', async () => {
    (kanbanRepo.findCategoryById as jest.Mock).mockResolvedValue({
      id: categoryId,
      pageId,
    });
    (kanbanRepo.getMaxCategoryOptionPosition as jest.Mock).mockResolvedValue(0);
    (kanbanRepo.createCategoryOption as jest.Mock).mockResolvedValue({
      id: optionId,
      categoryId,
      label: 'Bug',
      color: 'red',
      position: 1000,
    });

    const result = await service.createCategoryOption(categoryId, 'Bug', 'red');

    expect(kanbanRepo.createCategoryOption).toHaveBeenCalledWith({
      categoryId,
      label: 'Bug',
      color: 'red',
      position: 1000,
    });
    expect(result.label).toBe('Bug');
  });

  it('throws NotFoundException creating an option under a missing category', async () => {
    (kanbanRepo.findCategoryById as jest.Mock).mockResolvedValue(undefined);

    await expect(
      service.createCategoryOption(categoryId, 'Bug'),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes a category option that exists', async () => {
    (kanbanRepo.findCategoryOptionById as jest.Mock).mockResolvedValue({
      id: optionId,
      categoryId,
    });

    await service.deleteCategoryOption(optionId);

    expect(kanbanRepo.deleteCategoryOption).toHaveBeenCalledWith(optionId);
  });

  describe('setCardCategoryValue', () => {
    beforeEach(() => {
      (kanbanRepo.findCardById as jest.Mock).mockResolvedValue({
        id: cardId,
        columnId,
      });
      (kanbanRepo.findCategoryById as jest.Mock).mockResolvedValue({
        id: categoryId,
        pageId,
      });
      (kanbanRepo.findColumnById as jest.Mock).mockResolvedValue({
        id: columnId,
        pageId,
      });
    });

    it('sets an option belonging to the category', async () => {
      (kanbanRepo.findCategoryOptionById as jest.Mock).mockResolvedValue({
        id: optionId,
        categoryId,
      });

      await service.setCardCategoryValue(cardId, categoryId, optionId, userId);

      expect(kanbanRepo.setCardCategoryValue).toHaveBeenCalledWith(
        cardId,
        categoryId,
        optionId,
      );
    });

    it('clears the value when optionId is null, without checking the option table', async () => {
      await service.setCardCategoryValue(cardId, categoryId, null, userId);

      expect(kanbanRepo.findCategoryOptionById).not.toHaveBeenCalled();
      expect(kanbanRepo.setCardCategoryValue).toHaveBeenCalledWith(
        cardId,
        categoryId,
        null,
      );
    });

    it('rejects an option that belongs to a different category', async () => {
      (kanbanRepo.findCategoryOptionById as jest.Mock).mockResolvedValue({
        id: optionId,
        categoryId: 'some-other-category',
      });

      await expect(
        service.setCardCategoryValue(cardId, categoryId, optionId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(kanbanRepo.setCardCategoryValue).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the card does not exist', async () => {
      (kanbanRepo.findCardById as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.setCardCategoryValue(cardId, categoryId, optionId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
