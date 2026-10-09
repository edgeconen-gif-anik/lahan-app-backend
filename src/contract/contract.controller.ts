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
import { ApprovalStatus, ContractStatus } from '@prisma/client';
import { ContractService } from './contract.service';
import {
  CreateContractDto,
  ProjectUpdateDto,
  UpdateContractDto,
} from './dto/contract.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get('next-number')
  getNextContractNumber(@Query('projectId') projectId?: string) {
    return this.contractService.getNextContractNumber(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createContractDto: CreateContractDto, @Request() req) {
    return this.contractService.create(createContractDto, req.user);
  }

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('companyId') companyId?: string,
    @Query('userCommitteeId') userCommitteeId?: string,
    @Query('userId') userId?: string,
    @Query('siteInchargeId') siteInchargeId?: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('approvalStatus') approvalStatus?: ApprovalStatus,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('implementor') implementor?: string,
    @Query('overdue') overdue?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Request() req?,
  ) {
    return this.contractService.findAll(
      {
        projectId,
        companyId,
        userCommitteeId,
        userId,
        siteInchargeId,
        fiscalYear,
        approvalStatus,
        search,
        status: Object.values(ContractStatus).find((value) => value === status),
        implementor:
          implementor === 'COMPANY' || implementor === 'USER_COMMITTEE'
            ? implementor
            : undefined,
        overdue: overdue === 'true',
        page,
        limit,
        sortBy,
        sortOrder,
      },
      req.user,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.contractService.findOne(id, req.user);
  }

  @Patch(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.contractService.approve(id, req.user);
  }

  @Patch(':id/project-update')
  projectUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() projectUpdateDto: ProjectUpdateDto,
    @Request() req,
  ) {
    return this.contractService.applyProjectUpdate(id, projectUpdateDto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateContractDto: UpdateContractDto,
    @Request() req,
  ) {
    return this.contractService.update(id, updateContractDto, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.contractService.remove(id, req.user);
  }
}
