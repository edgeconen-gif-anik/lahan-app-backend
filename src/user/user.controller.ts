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
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(ZodValidationPipe)
  create(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.userService.create(createUserDto, req.user);
  }

  @Get()
  @UsePipes(ZodValidationPipe)
  findAll(@Query() query: QueryUserDto, @Request() req) {
    return this.userService.findAll(query, req.user);
  }

  @Get(':id/profile')
  getProfile(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.getProfile(id, req.user);
  }

  @Get(':id/dashboard')
  getUserDashboard(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.getUserDashboard(id, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.findOne(id, req.user);
  }

  @Patch(':id')
  @UsePipes(ZodValidationPipe)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ) {
    return this.userService.update(id, updateUserDto, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.remove(id, req.user);
  }
}
