import { Repository, Brackets } from 'typeorm';
import { AbstractPaginationDto, PaginatedResult } from '../dto/pagination.dto';

export abstract class AbstractRepository<T extends { id: number }> {
  protected constructor(protected readonly repository: Repository<T>) {}

  // Override in concrete repository to indicate which columns are searchable
  protected getSearchableColumns(): string[] {
    return []; // e.g. ['name','email']
  }

  // Override in concrete repository to indicate which columns are sortable
  protected getSortableColumns(): string[] {
    return ['id'];
  }

  async findAll(
    pagination: AbstractPaginationDto,
  ): Promise<PaginatedResult<T>> {
    const { page, limit, sortBy, order, search, filters } = pagination;

    const qb = this.repository.createQueryBuilder('e');

    // Apply filters (exact matches)
    if (filters) {
      try {
        const parsed = JSON.parse(filters);
        Object.keys(parsed).forEach((key) => {
          const param = `filter_${key}`;
          qb.andWhere(`e.${key} = :${param}`, { [param]: parsed[key] });
        });
      } catch (err) {
        // invalid JSON - ignore filters or you could throw an error
      }
    }

    // Apply search (LIKE on configured searchable columns)
    if (search) {
      const cols = this.getSearchableColumns();
      if (cols.length) {
        qb.andWhere(
          new Brackets((sqb) => {
            cols.forEach((col, idx) => {
              const param = `search_${idx}`;
              if (idx === 0)
                sqb.where(`e.${col} LIKE :${param}`, {
                  [param]: `%${search}%`,
                });
              else
                sqb.orWhere(`e.${col} LIKE :${param}`, {
                  [param]: `%${search}%`,
                });
            });
          }),
        );
      }
    }

    // Sorting: allow only configured sortable columns to avoid injection
    const sortable = this.getSortableColumns();
    const safeSort = sortBy && sortable.includes(sortBy) ? sortBy : 'id';
    qb.orderBy(
      `e.${safeSort}`,
      order && order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    );

    // Pagination + execute
    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<T | null> {
    return this.repository.findOne({ where: { id } as any });
  }

  async create(entity: Partial<T>): Promise<T> {
    const instance = this.repository.create(entity as any);
    return this.repository.save(instance as any);
  }

  async update(id: number, entity: Partial<T>): Promise<T> {
    await this.repository.update(id, entity as any);
    const updated = await this.findOne(id);
    if (!updated)
      throw new Error(`Entity with id ${id} not found after update`);
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}
