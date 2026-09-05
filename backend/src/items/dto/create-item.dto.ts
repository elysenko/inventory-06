import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateItemDto {
  @ApiProperty({ example: 'SKU-001', maxLength: 64 })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  sku!: string;

  @ApiProperty({ example: 'Hex Bolt M8 x 40mm' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ example: 'box', description: 'Unit of issue.' })
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  unit!: string;

  @ApiProperty({
    example: 10,
    description: 'Low-stock threshold: totalQty <= reorderAt flags the item.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderAt!: number;
}
