import { Type } from 'class-transformer';
import { IsInt, Min, IsOptional, IsIn, IsString } from 'class-validator';

export abstract class AbstractPaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order?: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @IsString()
  search?: string;

  /*
Filters should be passed as a JSON-encoded string in the `filters` query param.
Example: ?filters={"role":"admin","active":true}
(URL-encode the value when calling from clients)
*/
  @IsOptional()
  @IsString()
  filters?: string; // JSON string
}

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
