import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { SetupModule } from '../setup/setup.module';

@Module({
  imports: [SetupModule],
  providers: [ProjectService],
  controllers: [ProjectController],
})
export class ProjectModule {}
