import { Repository, Brackets } from 'typeorm';
import { AbstractPaginationDto, PaginatedResult } from '../dto/pagination.dto';
import {
    BadRequestException,
    ConflictException,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';

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
        try {
            const { page, limit, sortBy, order, search, filters } = pagination;

            const qb = this.repository.createQueryBuilder('e');

            // Apply filters (exact matches)
            if (filters) {
                try {
                    const parsed = JSON.parse(filters);
                    Object.keys(parsed).forEach((key) => {
                        const param = `filter_${key}`;
                        qb.andWhere(`e.${key} = :${param}`, {
                            [param]: parsed[key],
                        });
                    });
                } catch (err) {
                    throw new BadRequestException('Invalid filters JSON');
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
            const safeSort =
                sortBy && sortable.includes(sortBy) ? sortBy : 'id';
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
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }

    async findOne(id: number): Promise<T> {
        if (isNaN(id)) {
            throw new BadRequestException('Invalid id format');
        }
        const entity = await this.repository.findOne({ where: { id } as any });
        if (!entity) {
            throw new NotFoundException(`Entity with id ${id} not found`);
        }
        return entity;
    }
    async create(entity: Partial<T>): Promise<T> {
        try {
            const instance = this.repository.create(entity as any);
            return await this.repository.save(instance as any);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                // MySQL duplicate entry error code
                throw new ConflictException(
                    `Duplicate value for unique field(s): ${this.extractDuplicateField(
                        error.message,
                    )}`,
                );
            }
            throw new InternalServerErrorException(error.message);
        }
    }

    async update(id: number, entity: Partial<T>): Promise<T> {
        if (isNaN(id)) {
            throw new BadRequestException('Invalid id format');
        }
        try {
            await this.repository.update(id, entity as any);
            const updated = await this.findOne(id);
            return updated;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new ConflictException(
                    `Duplicate value for unique field(s): ${this.extractDuplicateField(
                        error.message,
                    )}`,
                );
            }
            throw new InternalServerErrorException(error.message);
        }
    }

    async delete(id: number): Promise<void> {
        if (isNaN(id)) {
            throw new BadRequestException('Invalid id format');
        }
        const result = await this.repository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Entity with id ${id} not found`);
        }
    }

    private extractDuplicateField(message: string): string {
        // MySQL duplicate entry message looks like:
        // "Duplicate entry 'test@example.com' for key 'users.email'"
        const match = message.match(/for key '(.+)'/);
        return match ? match[1] : 'unknown';
    }
}
