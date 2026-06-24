import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import {
  CreateFuelLogDto,
  QueryFuelLogDto,
  ReviewFuelLogDto,
  UpdateFuelLogDto,
} from './dto/fuel.dto';
import { FuelService } from './fuel.service';

@Controller('fuel-logs')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createFuelLogDto: CreateFuelLogDto, @Request() req) {
    return this.fuelService.create(createFuelLogDto, req.user);
  }

  @Get()
  findAll(@Query() query: QueryFuelLogDto, @Request() req) {
    return this.fuelService.findAll(query, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.fuelService.findOne(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFuelLogDto: UpdateFuelLogDto,
    @Request() req,
  ) {
    return this.fuelService.update(id, updateFuelLogDto, req.user);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewFuelLogDto: ReviewFuelLogDto,
    @Request() req,
  ) {
    return this.fuelService.approve(id, reviewFuelLogDto, req.user);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewFuelLogDto: ReviewFuelLogDto,
    @Request() req,
  ) {
    return this.fuelService.reject(id, reviewFuelLogDto, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.fuelService.remove(id, req.user);
  }
}
