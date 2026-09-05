import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { LoginDto } from './login.dto';

export class SignupDto extends LoginDto {
  @ApiPropertyOptional({ description: 'Display name shown in the audit log.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  name?: string;
}
