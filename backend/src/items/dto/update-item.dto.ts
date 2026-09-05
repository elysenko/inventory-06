import { PartialType } from '@nestjs/swagger';

import { CreateItemDto } from './create-item.dto';

/** Every field optional; only the supplied ones are written. */
export class UpdateItemDto extends PartialType(CreateItemDto) {}
