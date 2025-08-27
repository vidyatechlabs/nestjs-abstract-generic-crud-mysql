import { AbstractPaginationDto } from '../dto/pagination.dto';
import { AbstractRepository } from '../repositories/abstract.repository';

export abstract class AbstractService<
  T extends { id: number },
  CreateDto = Partial<T>,
  UpdateDto = Partial<T>,
> {
  protected constructor(protected readonly repository: AbstractRepository<T>) {}

  async findAll(pagination: AbstractPaginationDto) {
    return this.repository.findAll(pagination);
  }

  async findOne(id: number) {
    return this.repository.findOne(id);
  }

  async create(data: CreateDto) {
    return this.repository.create(data as Partial<T>);
  }

  async update(id: number, data: UpdateDto) {
    return this.repository.update(id, data as Partial<T>);
  }

  async delete(id: number) {
    return this.repository.delete(id);
  }
}
