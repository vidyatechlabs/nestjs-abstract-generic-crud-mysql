import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../common/repositories/abstract.repository';
import { User } from './entities/user.entity';

@Injectable()
export class UserRepository extends AbstractRepository<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }

  // Allow search on name and email
  protected getSearchableColumns(): string[] {
    return ['name', 'email'];
  }

  // Allow sorting by these columns
  protected getSortableColumns(): string[] {
    return ['id', 'name', 'email', 'createdAt'];
  }
}
