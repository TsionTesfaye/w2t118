import { BaseRepository } from './BaseRepository.js';

export class CategoryRepository extends BaseRepository {
  constructor() {
    super('categories');
  }

  async getByParentId(parentId) {
    return this.getByIndex('parentId', parentId);
  }

  async getRootCategories() {
    const all = await this.getAll();
    return all.filter(c => !c.parentId);
  }
}

export const categoryRepository = new CategoryRepository();
