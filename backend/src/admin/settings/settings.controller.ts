import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { AdminSettingsService, SettingsServiceView } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.MANAGER)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Credential status per backing service' })
  list(): Promise<SettingsServiceView[]> {
    return this.settings.list();
  }

  @Patch()
  @ApiOperation({ summary: 'Upsert backing-service credentials' })
  update(@Body() dto: UpdateSettingsDto): Promise<SettingsServiceView[]> {
    return this.settings.update(dto);
  }
}
