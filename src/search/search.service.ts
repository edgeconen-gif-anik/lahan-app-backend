import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetupService } from '../setup/setup.service';
import { AuthUser, getApprovalVisibilityWhere } from '../auth/auth-user';
import {
  getCurrentNepaliFiscalYear,
  getFiscalYearVariants,
  normalizeFiscalYear,
} from '../setup/fiscal-year';

const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

export type SearchResults = {
  projects: {
    id: string;
    name: string;
    sNo: string | null;
    fiscalYear: string;
  }[];
  contracts: {
    id: string;
    contractNumber: string;
    projectName: string | null;
    fiscalYear: string;
  }[];
  companies: { id: string; name: string; address: string }[];
  committees: { id: string; name: string; address: string }[];
};

const EMPTY_RESULTS: SearchResults = {
  projects: [],
  contracts: [],
  companies: [],
  committees: [],
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly setupService: SetupService,
  ) {}

  private async resolveFiscalYearFilter(value?: string | null) {
    if (value?.trim().toLowerCase() === 'all') {
      return [];
    }

    const rawFiscalYear =
      value?.trim() ||
      (await this.setupService.getCurrentFiscalYear()) ||
      getCurrentNepaliFiscalYear();

    return getFiscalYearVariants(
      normalizeFiscalYear(rawFiscalYear) ?? rawFiscalYear,
    );
  }

  /**
   * Quick lookup for the command palette. Applies the same fiscal-year scoping
   * and approval visibility as the list endpoints, and returns only the few
   * fields needed to render and link a result.
   */
  async search(
    rawQuery: string | undefined,
    fiscalYear: string | undefined,
    user: AuthUser,
  ): Promise<SearchResults> {
    const q = rawQuery?.trim().slice(0, MAX_QUERY_LENGTH) ?? '';
    if (q.length < MIN_QUERY_LENGTH) {
      return EMPTY_RESULTS;
    }

    const fiscalYearVariants = await this.resolveFiscalYearFilter(fiscalYear);
    const inFiscalYear = fiscalYearVariants.length
      ? { fiscalYear: { in: fiscalYearVariants } }
      : {};
    const contains = (field: string) => ({
      [field]: { contains: q, mode: 'insensitive' as const },
    });
    const visibility = getApprovalVisibilityWhere(user);

    const projectWhere: Prisma.ProjectWhereInput = {
      ...inFiscalYear,
      OR: [contains('name'), contains('sNo'), contains('budgetCode')],
    };

    const contractWhere: Prisma.ContractWhereInput = {
      AND: [
        visibility,
        fiscalYearVariants.length
          ? {
              OR: [
                { fiscalYear: { in: fiscalYearVariants } },
                { project: { fiscalYear: { in: fiscalYearVariants } } },
              ],
            }
          : {},
        {
          OR: [
            contains('contractNumber'),
            { project: contains('name') },
            { company: contains('name') },
            { userCommittee: contains('name') },
          ],
        },
      ],
    };

    // Matches the list endpoint: companies are not approval-filtered there.
    const companyWhere: Prisma.CompanyWhereInput = {
      ...inFiscalYear,
      OR: [contains('name'), contains('officeRegistrationNumber')],
    };

    const committeeWhere: Prisma.UserCommitteeWhereInput = {
      AND: [
        visibility,
        inFiscalYear,
        { OR: [contains('name'), contains('address')] },
      ],
    };

    const [projects, contracts, companies, committees] = await Promise.all([
      this.prisma.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, sNo: true, fiscalYear: true },
        orderBy: { createdAt: 'desc' },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.contract.findMany({
        where: contractWhere,
        select: {
          id: true,
          contractNumber: true,
          fiscalYear: true,
          project: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.company.findMany({
        where: companyWhere,
        select: { id: true, name: true, address: true },
        orderBy: { createdAt: 'desc' },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.userCommittee.findMany({
        where: committeeWhere,
        select: { id: true, name: true, address: true },
        orderBy: { createdAt: 'desc' },
        take: RESULTS_PER_TYPE,
      }),
    ]);

    return {
      projects,
      contracts: contracts.map((contract) => ({
        id: contract.id,
        contractNumber: contract.contractNumber,
        projectName: contract.project?.name ?? null,
        fiscalYear: contract.fiscalYear,
      })),
      companies,
      committees,
    };
  }
}
