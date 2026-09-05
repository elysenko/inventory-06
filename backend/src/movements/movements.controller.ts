import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  MovementsService,
  MovementRow,
  PaginatedMovements,
} from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('movements')
@ApiBearerAuth()
@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Post()
  @ApiOperation({ summary: 'Record an IN / OUT / TRANSFER movement' })
  create(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MovementRow> {
    return this.movements.create(dto, user);
  }

  @Get()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Filterable audit log (managers only)' })
  findAll(@Query() query: QueryMovementsDto): Promise<PaginatedMovements> {
    return this.movements.findAll(query);
  }
}
