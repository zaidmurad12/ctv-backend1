import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import type { PersonDetailDto } from './dto.js';
import { PeopleUseCases } from './useCases.js';
import { PublicCache } from '../common/interceptors/publicCacheInterceptor.js';

// Public like movies/shows - tapping a cast/crew member's photo browses without a login gate.
@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly peopleUseCases: PeopleUseCases) {}

  @PublicCache()
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: "A person's profile plus every published movie/show they're credited on",
  })
  getById(@Param('id') id: string): Promise<PersonDetailDto> {
    return this.peopleUseCases.getById(id);
  }
}
