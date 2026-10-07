import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateBookDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  categoryId!: number;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/u, { message: 'title must contain a non-whitespace character' })
  title!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  description?: string;
}
