import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { SetupService } from './setup.service';
import { UpdateSystemSettingDto } from './dto/setup.dto';

@Controller('setup')
@UseGuards(JwtAuthGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get()
  getSettings() {
    return this.setupService.getSettings();
  }

  @Get('fiscal-years')
  listFiscalYears() {
    return this.setupService.listFiscalYears();
  }

  @Patch()
  @UsePipes(ZodValidationPipe)
  updateSettings(@Body() dto: UpdateSystemSettingDto, @Request() req) {
    return this.setupService.updateSettings(dto, req.user);
  }
}
