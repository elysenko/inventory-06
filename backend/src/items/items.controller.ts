import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { ItemsService, ItemDetail, ItemRow } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Catalogue with rolled-up totalQty' })
  findAll(@Query() query: QueryItemsDto): Promise<ItemRow[]> {
    return this.items.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Item with its per-location breakdown' })
  findOne(@Param('id') id: string): Promise<ItemDetail> {
    return this.items.findOne(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateItemDto): Promise<ItemRow> {
    return this.items.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<ItemRow> {
    return this.items.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return this.items.remove(id);
  }
}
