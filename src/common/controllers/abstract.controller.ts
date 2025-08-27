import {
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AbstractService } from '../services/abstract.service';
import { AbstractPaginationDto } from '../dto/pagination.dto';

export abstract class AbstractController<
  T extends { id: number },
  CreateDto = any,
  UpdateDto = any,
> {
  protected constructor(
    protected readonly service: AbstractService<T, CreateDto, UpdateDto>,
  ) {}

  @Post('list')
  async findAllWithSearch(@Body() pagination: AbstractPaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get()
  async findAll(@Query() pagination: AbstractPaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
