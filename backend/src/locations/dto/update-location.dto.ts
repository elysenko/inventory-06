import { PartialType } from '@nestjs/swagger';

import { CreateLocationDto } from './create-location.dto';

/** Every field optional; only the supplied ones are written. */
export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
