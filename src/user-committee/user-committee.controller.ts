import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
} from '@nestjs/common';
import { UserCommitteeService } from './user-committee.service';
import {
  CreateUserCommitteeDto,
  UpdateUserCommitteeDto,
  QueryUserCommitteeDto,
} from './dto/user-committee.dto';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('user-committees')
export class UserCommitteeController {
  constructor(private readonly userCommitteeService: UserCommitteeService) {}

  @Post()
  @UsePipes(ZodValidationPipe)
  create(@Body() dto: CreateUserCommitteeDto) {
    return this.userCommitteeService.create(dto);
  }

  @Get()
  @UsePipes(ZodValidationPipe)
  findAll(@Query() query: QueryUserCommitteeDto) {
    return this.userCommitteeService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userCommitteeService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(ZodValidationPipe)
  update(@Param('id') id: string, @Body() dto: UpdateUserCommitteeDto) {
    return this.userCommitteeService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userCommitteeService.remove(id);
  }
}