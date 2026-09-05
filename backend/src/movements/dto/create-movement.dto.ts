import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
  @ApiProperty({ enum: MovementType })
  @IsEnum(MovementType, { message: 'type must be one of IN, OUT, TRANSFER' })
  type!: MovementType;

  @ApiProperty()
  @IsString()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Source location — OUT and TRANSFER.' })
  @IsOptional()
  @IsString()
  fromLocId?: string | null;

  @ApiPropertyOptional({ description: 'Destination location — IN and TRANSFER.' })
  @IsOptional()
  @IsString()
  toLocId?: string | null;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'qty must be at least 1' })
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
