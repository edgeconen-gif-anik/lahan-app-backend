// src/user/user.controller.ts
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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // POST /users
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(ZodValidationPipe)
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  // GET /users
  @Get()
  @UsePipes(ZodValidationPipe)
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  // ⚠️ Literal sub-routes MUST come before :id — otherwise NestJS
  //    treats "profile" / "dashboard" as a UUID param → wrong handler → 404

  // GET /users/:id/profile  ✅ ADDED — was missing, causing 404
  @Get(':id/profile')
  getProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getProfile(id);
  }

  // GET /users/:id/dashboard
  @Get(':id/dashboard')
  getUserDashboard(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getUserDashboard(id);
  }

  // GET /users/:id  — must stay AFTER the two sub-routes above
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  // PATCH /users/:id
  @Patch(':id')
  @UsePipes(ZodValidationPipe)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(id, updateUserDto);
  }

  // DELETE /users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.remove(id);
  }
}