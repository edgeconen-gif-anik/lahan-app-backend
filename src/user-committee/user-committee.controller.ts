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
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { UserCommitteeService } from './user-committee.service';
import {
  CreateUserCommitteeDto,
  UpdateUserCommitteeDto,
  QueryUserCommitteeDto,
} from './dto/user-committee.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@Controller('user-committees')
@UseGuards(JwtAuthGuard)
export class UserCommitteeController {
  constructor(private readonly userCommitteeService: UserCommitteeService) {}

  @Post()
  @UsePipes(ZodValidationPipe)
  create(@Body() dto: CreateUserCommitteeDto, @Request() req) {
    return this.userCommitteeService.create(dto, req.user);
  }

  @Get()
  @UsePipes(ZodValidationPipe)
  findAll(@Query() query: QueryUserCommitteeDto, @Request() req) {
    return this.userCommitteeService.findAll(query, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.userCommitteeService.findOne(id, req.user);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Request() req) {
    return this.userCommitteeService.approve(id, req.user);
  }

  @Patch(':id')
  @UsePipes(ZodValidationPipe)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserCommitteeDto,
    @Request() req,
  ) {
    return this.userCommitteeService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.userCommitteeService.remove(id, req.user);
  }
}
