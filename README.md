## **NestJS boilerplate** using **abstract classes** for controller, service, repository, and DTO with **pagination** (TypeORM + MySQL). This approach ensures you don’t duplicate CRUD logic across multiple entitiesProject setup.

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

---

# 📂 Folder Structure

```plaintext
src/
│── main.ts
│── app.module.ts
│
├── common/
│   ├── controllers/
│   │   └── abstract.controller.ts
│   ├── dto/
│   │   └── pagination.dto.ts
│   ├── repositories/
│   │   └── abstract.repository.ts
│   ├── filters/
│   │   └── global-exception.filter.ts
│   ├── services/
│   │   └── abstract.service.ts
│
├── user/
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   ├── entities/
│   │   └── user.entity.ts
│   ├── user.repository.ts
│   ├── user.service.ts
│   ├── user.controller.ts
│   └── user.module.ts
│
└── database/
    └── typeorm.config.ts
```

---

# 📦 Package Installation

```bash
npm install @nestjs/common @nestjs/core @nestjs/typeorm @nestjs/config typeorm mysql2 class-validator class-transformer reflect-metadata rxjs
npm install -D @types/node
```

---

# ⚙️ Core Files

### `main.ts`

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3000);
}
bootstrap();
```

### `app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import typeOrmConfig from './database/typeorm.config';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    UserModule,
  ],
})
export class AppModule {}
```

### `database/typeorm.config.ts`

```ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'password',
  database: process.env.DB_NAME || 'test_db',
  autoLoadEntities: true,
  synchronize: true, // ⚠️ Only for dev
};

export default typeOrmConfig;
```

---

# 🛠 Common Layer

### `common/dto/pagination.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, IsIn, IsObject } from 'class-validator';

export class AbstractPaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @IsOptional()
  search?: string;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

### `common/repositories/abstract.repository.ts`

```ts
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

```

### `common/services/abstract.service.ts`

```ts
import { AbstractPaginationDto } from '../dto/pagination.dto';
import { AbstractRepository } from '../repositories/abstract.repository';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export abstract class AbstractService<T extends { id: number }> {
  protected constructor(protected readonly repository: AbstractRepository<T>) {}

  async findAll(pagination: AbstractPaginationDto) {
    return this.repository.findAll(pagination);
  }

  async findOne(id: number) {
    return this.repository.findOne(id);
  }

  async create(data: Partial<T>) {
    return this.repository.create(data);
  }

  async update(id: number, data: QueryDeepPartialEntity<T>) {
    return this.repository.update(id, data);
  }

  async delete(id: number) {
    return this.repository.delete(id);
  }
}
```

### `common/controllers/abstract.controller.ts`

```ts
import { Body, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { AbstractService } from '../services/abstract.service';
import { AbstractPaginationDto } from '../dto/pagination.dto';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export abstract class AbstractController<
  T extends { id: number },
  CreateDto = any,
  UpdateDto = any,
> {
  protected constructor(protected readonly service: AbstractService<T>) {}

  // ✅ POST for advanced listing
  @Post('list')
  async findAll(@Body() pagination: AbstractPaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateDto) {
    return this.service.create(dto as Partial<T>);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDto,
  ) {
    return this.service.update(id, dto as QueryDeepPartialEntity<T>);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
```

---

### `common/filters/global-exception.filter.ts`

```ts
import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';

        // ✅ NestJS HttpException (NotFound, BadRequest, etc.)
        if (exception instanceof HttpException) {
            status = exception.getStatus();
            message = exception.message;
        }

        // ✅ TypeORM QueryFailedError (MySQL)
        else if (exception instanceof QueryFailedError) {
            const err: any = exception;

            // Duplicate key in MySQL (ER_DUP_ENTRY = 1062)
            if (err.code === 'ER_DUP_ENTRY') {
                status = HttpStatus.CONFLICT;
                const field = this.extractDuplicateField(err.message);
                message = `Duplicate value for unique field(s): ${field}`;
            } else {
                status = HttpStatus.BAD_REQUEST;
                message = `MySQL Error: ${err.message}`;
            }
        }

        response.status(status).json({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: ctx.getRequest().url,
        });
    }

    // Helper to parse duplicate field from MySQL error message
    private extractDuplicateField(msg: string): string {
        const match = msg.match(/for key '(.+?)'/);
        if (match) {
            return match[1].replace('users.', '');
        }
        return 'unknown';
    }
}

---




# 👤 User Module Example

### `user/entities/user.entity.ts`

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

### `user/dto/create-user.dto.ts`

```ts
import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;
}
```

### `user/dto/update-user.dto.ts`

```ts
import { IsEmail, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  isActive?: boolean;
}
```

### `user/user.repository.ts`

```ts
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

  protected getSearchableColumns(): (keyof User)[] {
    return ['name', 'email'];
  }

  protected getSortableColumns(): (keyof User)[] {
    return ['id', 'name', 'email', 'createdAt'];
  }
}
```

### `user/user.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { AbstractService } from '../common/services/abstract.service';
import { User } from './entities/user.entity';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService extends AbstractService<User> {
  constructor(private readonly userRepo: UserRepository) {
    super(userRepo);
  }
}
```

### `user/user.controller.ts`

```ts
import { Controller } from '@nestjs/common';
import { AbstractController } from '../common/controllers/abstract.controller';
import { User } from './entities/user.entity';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UserController extends AbstractController<
  User,
  CreateUserDto,
  UpdateUserDto
> {
  constructor(private readonly userService: UserService) {
    super(userService);
  }
}
```

### `user/user.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserRepository, UserService],
  controllers: [UserController],
})
export class UserModule {}
```

---

# Running the Project

```bash
npm run start:dev
```

1. Make sure you have **MySQL running**:

   ```bash
   docker run --name mysql -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=test_db -p 3306:3306 -d mysql:8
   ```
2. Start the NestJS app:

   ```bash
   npm run start:dev
   ```
3. Endpoints available:

   * `GET /users?page=1&limit=10`
   * `GET /users/1`
   * `POST /users { "name": "John", "email": "john@example.com" }`
   * `PUT /users/1 { "name": "Updated" }`
   * `DELETE /users/1`

3. Now your MySQL side behaves exactly like the Mongo side:

  * `400 → Invalid ID or bad filter JSON`
  * `404 → Missing entity`
  * `409 → Duplicate field (unique constraint violation)`
  * `500 → Unexpected DB errors`   

### Example Request (Postman)

Got it 👍 You want **ready-to-use Postman examples** for your MySQL (TypeORM) endpoints using the `AbstractRepository` we just built.

Here’s a **sample REST collection** (assuming your entity is `User` with fields: `id`, `name`, `email`) and your routes look like `/users`:

---

### **1. Create User**

**POST** `http://localhost:3000/users`

**Body (JSON):**

```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

---

### **2. Get All Users (with pagination, search, filters, sorting)**

**GET** `http://localhost:3000/users?page=1&limit=10&sortBy=name&order=ASC&search=john&filters={"email":"john@example.com"}`

📌 In Postman:

* Set request to **GET**.
* Add these as **Query Params**:

  ```
  page     = 1
  limit    = 10
  sortBy   = name
  order    = ASC
  search   = john
  filters  = {"email":"john@example.com"}
  ```

---

### **3. Get User by ID**

**GET** `http://localhost:3000/users/1`

---

### **4. Update User**

**PUT** `http://localhost:3000/users/1`

**Body (JSON):**

```json
{
  "name": "Johnny Updated",
  "email": "johnny@example.com"
}
```

---

### **5. Delete User**

**DELETE** `http://localhost:3000/users/1`

---

### ⚠️ Error Scenarios to Test in Postman

1. **Invalid ID format** →
   GET `http://localhost:3000/users/abc`
   → Should return `400 Bad Request` with message `"Invalid id format"`

2. **User not found** →
   GET `http://localhost:3000/users/9999`
   → Should return `404 Not Found` with message `"Entity with id 9999 not found"`

3. **Duplicate email** →
   POST `/users` with the same `email` twice
   → Should return `409 Conflict` with message `"Duplicate value for unique field(s): users.email"`

---

Working code that adds **searching, sorting, and filtering** to the abstract listing logic.

Quick summary:

* `AbstractPaginationDto` now accepts `search`, `sortBy`, `order`, and `filters` (JSON string).
* `AbstractRepository.findAll()` uses a TypeORM `QueryBuilder` to apply:

  * exact `filters` (JSON parsed),
  * `search` (LIKE across searchable columns — OR combined),
  * `sortBy`/`order` (only allowed when included in the repository's `getSortableColumns()`).
* Concrete repos (e.g., `UserRepository`) override:

  * `getSearchableColumns()` → `['name','email']`
  * `getSortableColumns()` → `['id','name','email','createdAt']`
* Examples for queries are in the document (and note: `filters` should be URL-encoded JSON).

---
