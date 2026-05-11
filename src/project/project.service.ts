import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApprovalStatus,
  Prisma,
  Project,
  ProjectImplantedThrough,
} from '@prisma/client';
import * as Papa from 'papaparse';

import {
  CreateProjectSchema,
  CreateProjectDto,
} from './dto/create-project.dto';
import {
  UpdateProjectSchema,
  UpdateProjectDto,
} from './dto/update-project.dto';
import { QueryProjectSchema, QueryProjectDto } from './dto/query-project.dto';
import { ImportProjectRowSchema } from './dto/import-project.dto';
import {
  AuthUser,
  getApprovalVisibilityWhere,
  isAdminUser,
  requireAdminUser,
} from '../auth/auth-user';
import {
  getFiscalYearVariants,
  normalizeFiscalYear,
} from '../setup/fiscal-year';
import { SetupService } from '../setup/setup.service';

function mapProject(project: Project) {
  return {
    ...project,
    allocatedBudget: Number(project.allocatedBudget),
    internalBudget: Number(project.internalBudget),
    centralBudget: Number(project.centralBudget),
    provinceBudget: Number(project.provinceBudget),
  };
}

function mapImplantedThrough(
  val: string | null | undefined,
): ProjectImplantedThrough | null | undefined {
  if (val === null) return null;
  if (!val) return undefined;
  if (val === 'COMPANY') return ProjectImplantedThrough.COMP;
  if (val === 'USER_COMMITTEE') return ProjectImplantedThrough.USER_COMMITTEE;
  return val as ProjectImplantedThrough;
}

function safeDecimal(val: any): Prisma.Decimal {
  if (val === null || val === undefined || val.toString().trim() === '') {
    return new Prisma.Decimal(0);
  }
  const cleaned = val.toString().replace(/,/g, '');
  const parsed = Number(cleaned);
  if (isNaN(parsed)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(parsed);
}

const PROJECT_LIST_INCLUDE = {
  company: {
    select: {
      id: true,
      name: true,
      approvalStatus: true,
    },
  },
  userCommittee: {
    select: {
      id: true,
      name: true,
      approvalStatus: true,
    },
  },
  siteIncharge: {
    select: { id: true, name: true, designation: true },
  },
} satisfies Prisma.ProjectInclude;

function getProjectInclude(user: AuthUser) {
  return {
    company: {
      select: {
        id: true,
        name: true,
        panNumber: true,
        approvalStatus: true,
      },
    },
    userCommittee: {
      select: {
        id: true,
        name: true,
        approvalStatus: true,
      },
    },
    siteIncharge: {
      select: { id: true, name: true, designation: true },
    },
    contracts: {
      where: getApprovalVisibilityWhere(user),
      select: {
        id: true,
        contractNumber: true,
        contractAmount: true,
        status: true,
        startDate: true,
        intendedCompletionDate: true,
        actualCompletionDate: true,
        siteIncharge: {
          select: { id: true, name: true, designation: true },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    },
  } satisfies Prisma.ProjectInclude;
}

function sanitizeApprovalRelation<
  T extends { approvalStatus?: ApprovalStatus | null },
>(relation: T | null | undefined, user: AuthUser) {
  if (relation === undefined) {
    return undefined;
  }

  if (relation === null) {
    return null;
  }

  if (
    isAdminUser(user) ||
    relation.approvalStatus === ApprovalStatus.APPROVED
  ) {
    const { approvalStatus, ...visibleRelation } = relation;
    return visibleRelation;
  }

  return null;
}

function sanitizeProjectVisibility(project: any, user: AuthUser) {
  return {
    ...project,
    company: sanitizeApprovalRelation(project.company, user),
    userCommittee: sanitizeApprovalRelation(project.userCommittee, user),
  };
}

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly setupService: SetupService,
  ) {}

  private async resolveFiscalYear(value?: string | null) {
    const rawFiscalYear =
      value?.trim() || (await this.setupService.getCurrentFiscalYear());
    return normalizeFiscalYear(rawFiscalYear) ?? rawFiscalYear;
  }

  async create(dto: CreateProjectDto, user: AuthUser) {
    requireAdminUser(user);

    const data = CreateProjectSchema.parse(dto);
    const fiscalYear = await this.resolveFiscalYear(data.fiscalYear);
    const implantedThrough = mapImplantedThrough(data.implantedThrough);

    const duplicate = await this.prisma.project.findFirst({
      where: {
        name: data.name,
        type: data.type,
        budgetCode: data.budgetCode,
        fiscalYear: { in: getFiscalYearVariants(fiscalYear) },
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `A project named "${data.name}" already exists for this Ward/Type and Budget Code in ${fiscalYear}.`,
      );
    }

    const payload: Prisma.ProjectUncheckedCreateInput = {
      ...data,
      fiscalYear,
      implantedThrough,
      companyId:
        implantedThrough === ProjectImplantedThrough.COMP
          ? data.companyId
          : null,
      userCommitteeId:
        implantedThrough === ProjectImplantedThrough.USER_COMMITTEE
          ? data.userCommitteeId
          : null,
      allocatedBudget: safeDecimal(data.allocatedBudget),
      internalBudget: safeDecimal(data.internalBudget),
      centralBudget: safeDecimal(data.centralBudget),
      provinceBudget: safeDecimal(data.provinceBudget),
    };

    const project = await this.prisma.project.create({ data: payload });
    return mapProject(project);
  }

  async findAll(query: QueryProjectDto, user: AuthUser) {
    const q = QueryProjectSchema.parse(query);
    const skip = (q.page - 1) * q.limit;
    const fiscalYearVariants = getFiscalYearVariants(q.fiscalYear);

    const where: Prisma.ProjectWhereInput = {
      ...(q.status && { status: q.status }),
      ...(fiscalYearVariants.length && {
        fiscalYear: { in: fiscalYearVariants },
      }),
      ...(q.search && {
        OR: [
          { sNo: { contains: q.search, mode: 'insensitive' } },
          { name: { contains: q.search, mode: 'insensitive' } },
          { budgetCode: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };

    if (q.sortBy === 'sNo') {
      const direction =
        q.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

      const [data, total] = await Promise.all([
        this.prisma.$queryRaw<Project[]>(Prisma.sql`
          SELECT * FROM "Project"
          WHERE 1=1
          ${q.status ? Prisma.sql`AND "status" = ${q.status}` : Prisma.sql``}
          ${
            fiscalYearVariants.length
              ? Prisma.sql`AND "fiscalYear" IN (${Prisma.join(fiscalYearVariants)})`
              : Prisma.sql``
          }
          ${
            q.search
              ? Prisma.sql`AND (
                "sNo" ILIKE ${'%' + q.search + '%'} OR
                "name" ILIKE ${'%' + q.search + '%'} OR
                "budgetCode" ILIKE ${'%' + q.search + '%'}
              )`
              : Prisma.sql``
          }
          ORDER BY NULLIF(regexp_replace("sNo", '[^0-9]', '', 'g'), '')::INTEGER ${direction} NULLS LAST
          LIMIT ${q.limit} OFFSET ${skip}
        `),
        this.prisma.project.count({ where }),
      ]);

      return {
        data: data.map((project) =>
          sanitizeProjectVisibility(mapProject(project), user),
        ),
        meta: { page: q.page, limit: q.limit, total },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: q.limit,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: PROJECT_LIST_INCLUDE,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: data.map((project) =>
        sanitizeProjectVisibility(mapProject(project), user),
      ),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: getProjectInclude(user),
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return sanitizeProjectVisibility(mapProject(project), user);
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthUser) {
    requireAdminUser(user);

    const data = UpdateProjectSchema.parse(dto);
    const fiscalYear =
      data.fiscalYear === undefined
        ? undefined
        : await this.resolveFiscalYear(data.fiscalYear);
    const shouldUpdateImplementation = data.implantedThrough !== undefined;
    const implantedThrough = shouldUpdateImplementation
      ? mapImplantedThrough(data.implantedThrough)
      : undefined;
    const implementationRelations: Prisma.ProjectUncheckedUpdateInput =
      !shouldUpdateImplementation
        ? {}
        : implantedThrough === ProjectImplantedThrough.COMP
          ? { companyId: data.companyId ?? null, userCommitteeId: null }
          : implantedThrough === ProjectImplantedThrough.USER_COMMITTEE
            ? { companyId: null, userCommitteeId: data.userCommitteeId ?? null }
            : { companyId: null, userCommitteeId: null };

    try {
      const payload: Prisma.ProjectUncheckedUpdateInput = {
        ...data,
        fiscalYear,
        implantedThrough,
        ...implementationRelations,
        allocatedBudget:
          data.allocatedBudget !== undefined
            ? safeDecimal(data.allocatedBudget)
            : undefined,
        internalBudget:
          data.internalBudget !== undefined
            ? safeDecimal(data.internalBudget)
            : undefined,
        centralBudget:
          data.centralBudget !== undefined
            ? safeDecimal(data.centralBudget)
            : undefined,
        provinceBudget:
          data.provinceBudget !== undefined
            ? safeDecimal(data.provinceBudget)
            : undefined,
      };

      const project = await this.prisma.project.update({
        where: { id },
        data: payload,
      });

      return mapProject(project);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A project with the same name, type, budget code, and fiscal year already exists.',
        );
      }

      throw new NotFoundException('Project not found or update failed');
    }
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);

    try {
      await this.prisma.project.delete({ where: { id } });
      return { success: true };
    } catch {
      throw new NotFoundException('Project not found');
    }
  }

  async importCsv(file: Express.Multer.File, user: AuthUser) {
    requireAdminUser(user);

    if (!file) throw new BadRequestException('CSV file required');
    const defaultFiscalYear = await this.resolveFiscalYear();

    let csvString = file.buffer.toString('utf8');
    csvString = csvString.replace(/^\uFEFF/, '');

    const parsed = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
    });

    const validRows: Prisma.ProjectCreateManyInput[] = [];
    const errors: any[] = [];
    let skippedDuplicates = 0;

    const fiscalYearsInCsv = [
      ...new Set(
        (parsed.data as any[])
          .map((r: any) => normalizeFiscalYear(r.fiscalYear) ?? r.fiscalYear)
          .map((year: string | undefined) => year?.trim() || defaultFiscalYear)
          .filter(Boolean),
      ),
    ];
    const fiscalYearLookupValues = [
      ...new Set(
        fiscalYearsInCsv.flatMap((year) => getFiscalYearVariants(year)),
      ),
    ];

    const existingProjects = await this.prisma.project.findMany({
      where: {
        fiscalYear: { in: fiscalYearLookupValues as string[] },
        sNo: { not: null },
      },
      select: { sNo: true, fiscalYear: true },
    });

    const existingSNoSet = new Set(
      existingProjects.map(
        (p) => `${normalizeFiscalYear(p.fiscalYear) ?? p.fiscalYear}:${p.sNo}`,
      ),
    );

    (parsed.data as any[]).forEach((row: any, index: number) => {
      const result = ImportProjectRowSchema.safeParse(row);

      if (!result.success) {
        errors.push({ row: index + 1, issues: result.error.flatten() });
        return;
      }

      const r = result.data;
      const sNoStr = r.sNo ? String(r.sNo).trim() : null;
      const fiscalYear =
        normalizeFiscalYear(r.fiscalYear) ||
        r.fiscalYear?.trim() ||
        defaultFiscalYear;

      if (
        sNoStr &&
        fiscalYear &&
        existingSNoSet.has(`${fiscalYear}:${sNoStr}`)
      ) {
        skippedDuplicates++;
        return;
      }

      validRows.push({
        sNo: sNoStr,
        name: r.name.trim(),
        type: r.type,
        budgetCode: r.budgetCode,
        fiscalYear,
        source: r.source,
        status: r.status ?? 'NOT_STARTED',
        implantedThrough: mapImplantedThrough(r.implantedThrough) ?? undefined,
        allocatedBudget: safeDecimal(r.allocatedBudget),
        internalBudget: safeDecimal(r.internalBudget),
        centralBudget: safeDecimal(r.centralBudget),
        provinceBudget: safeDecimal(r.provinceBudget),
      });
    });

    if (validRows.length > 0) {
      await this.prisma.project.createMany({
        data: validRows,
        skipDuplicates: true,
      });
    }

    return {
      inserted: validRows.length,
      skipped: skippedDuplicates,
      failed: errors.length,
      errors,
    };
  }
}
