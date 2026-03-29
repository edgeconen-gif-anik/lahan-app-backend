import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(@Body() body: any) {
    return this.projectService.create(body);
  }

  @Get()
  findAll(@Query() query: any, @Request() req) {
    return this.projectService.findAll(query, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.projectService.findOne(id, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.projectService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectService.remove(id);
  }

  @Post('import/csv')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(@UploadedFile() file: Express.Multer.File) {
    return this.projectService.importCsv(file);
  }
}
