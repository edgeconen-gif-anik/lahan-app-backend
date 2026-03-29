import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  ParseUUIDPipe, 
  Request,
  UseGuards,
  UsePipes // Remove ValidationPipe import
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { CompanyCategory } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod'; // <--- IMPORT THIS
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@ApiTags('Companies')
@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  // ==========================
  // CREATE
  // ==========================
  @Post()
  @ApiOperation({ summary: 'Register a new company' })
  @ApiResponse({ status: 201, description: 'Company successfully created.' })
  @ApiResponse({ status: 409, description: 'Conflict: PAN or Email already exists.' })
  
  // FIX: Use ZodValidationPipe instead of ValidationPipe
  @UsePipes(ZodValidationPipe) 
  create(@Body() createCompanyDto: CreateCompanyDto, @Request() req) {
    return this.companyService.create(createCompanyDto, req.user);
  }

  // ==========================
  // FIND ALL
  // ==========================
  @Get()
  @ApiOperation({ summary: 'Get all companies with optional search and filtering' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', enum: CompanyCategory, required: false })
  // No pipe needed here if you aren't validating the query object strictly, 
  // but if you do use a Query DTO, use ZodValidationPipe
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: CompanyCategory,
    @Request() req?,
  ) {
    return this.companyService.findAll({ search, category }, req.user);
  }

  // ==========================
  // FIND ONE
  // ==========================
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific company by ID' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.companyService.findOne(id, req.user);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a company registration' })
  approve(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.companyService.approve(id, req.user);
  }

  // ==========================
  // UPDATE
  // ==========================
  @Patch(':id')
  @ApiOperation({ summary: 'Update company details' })
  @ApiResponse({ status: 200, description: 'Company updated successfully.' })
  @ApiResponse({ status: 409, description: 'Conflict: Updated PAN or Email already in use.' })
  
  // FIX: Use ZodValidationPipe
  @UsePipes(ZodValidationPipe)
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateCompanyDto: UpdateCompanyDto,
    @Request() req,
  ) {
    return this.companyService.update(id, updateCompanyDto, req.user);
  }

  // ==========================
  // DELETE
  // ==========================
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a company' })
  @ApiResponse({ status: 200, description: 'Company deleted successfully.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.companyService.remove(id, req.user);
  }
}
