import { Injectable } from '@nestjs/common';
import { AbstractService } from '../common/services/abstract.service';
import { User } from './entities/user.entity';
import { UserRepository } from './user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService extends AbstractService<
  User,
  CreateUserDto,
  UpdateUserDto
> {
  constructor(private readonly userRepo: UserRepository) {
    super(userRepo);
  }
}
