import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Location } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Readable by any authenticated user — the movement form needs the list. */
  findAll(): Promise<Location[]> {
    return this.prisma.location.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Location> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location ${id} not found`);
    }
    return location;
  }

  create(dto: CreateLocationDto): Promise<Location> {
    return this.prisma.location.create({
      data: { name: dto.name, zone: dto.zone },
    });
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    await this.findOne(id);
    return this.prisma.location.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
      },
    });
  }

  /**
   * Refuses (409) to delete a location that still holds stock or that any
   * movement references, so neither a balance nor an audit row is orphaned.
   * Empty, never-used locations delete cleanly.
   */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.findOne(id);

    const holding = await this.prisma.stockLevel.aggregate({
      where: { locationId: id },
      _sum: { qty: true },
    });
    if ((holding._sum.qty ?? 0) > 0) {
      throw new ConflictException(
        `Location still holds ${holding._sum.qty} unit(s) of stock and cannot be deleted`,
      );
    }

    const movements = await this.prisma.movement.count({
      where: { OR: [{ fromLocId: id }, { toLocId: id }] },
    });
    if (movements > 0) {
      throw new ConflictException(
        `Location appears in ${movements} movement(s) in the audit log and cannot be deleted`,
      );
    }

    await this.prisma.location.delete({ where: { id } });
    return { id, deleted: true };
  }
}
