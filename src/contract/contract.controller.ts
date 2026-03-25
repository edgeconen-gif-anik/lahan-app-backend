// ─────────────────────────────────────────────────────────────────────────────
// src/contract/contract.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { ContractService } from './contract.service';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';

@Controller('contracts')
@UsePipes(ZodValidationPipe)
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  // ── Must be declared BEFORE :id routes so Express doesn't treat
  //    "next-number" as a UUID param
  @Get('next-number')
  getNextContractNumber() {
    return this.contractService.getNextContractNumber();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createContractDto: CreateContractDto) {
    return this.contractService.create(createContractDto);
  }

  // Supported query params:
  //   ?projectId=<uuid>
  //   ?companyId=<uuid>
  //   ?userCommitteeId=<uuid>
  //   ?userId=<uuid>        → filters by committee representative user (userID field)
  //   ?siteInchargeId=<uuid> → ✅ filters by contract's own site incharge
  @Get()
  findAll(
    @Query('projectId')       projectId?:       string,
    @Query('companyId')       companyId?:       string,
    @Query('userCommitteeId') userCommitteeId?: string,
    @Query('userId')          userId?:          string,
    @Query('siteInchargeId')  siteInchargeId?:  string, // ✅ NEW
  ) {
    return this.contractService.findAll({
      projectId,
      companyId,
      userCommitteeId,
      userId,
      siteInchargeId,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateContractDto: UpdateContractDto,
  ) {
    return this.contractService.update(id, updateContractDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.remove(id);
  }
}