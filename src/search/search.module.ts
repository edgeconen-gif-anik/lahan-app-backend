import { Module } from '@nestjs/common';
import { SetupModule } from '../setup/setup.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [SetupModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
