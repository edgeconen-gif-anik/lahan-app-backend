import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query('q') q: string | undefined,
    @Query('fiscalYear') fiscalYear: string | undefined,
    @Request() req,
  ) {
    return this.searchService.search(q, fiscalYear, req.user);
  }
}
