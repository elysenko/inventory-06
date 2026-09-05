import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SettingEntryDto {
  @ApiProperty({ example: 'MINIO_ACCESS_KEY' })
  @IsString()
  @MaxLength(120)
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  value!: string;
}

export class UpdateSettingsDto {
  @ApiProperty({ type: [SettingEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SettingEntryDto)
  entries!: SettingEntryDto[];
}
