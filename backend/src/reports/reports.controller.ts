import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { LowStockRow, ReportsService } from './reports.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('low-stock')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Items at or below their reorder threshold' })
  lowStock(): Promise<LowStockRow[]> {
    return this.reports.lowStock();
  }
}
