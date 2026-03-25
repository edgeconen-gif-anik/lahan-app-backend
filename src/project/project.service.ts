// src/project/project.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Project, ProjectImplantedThrough } from '@prisma/client';
import * as Papa from 'papaparse';

import { CreateProjectSchema, CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectSchema, UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectSchema, QueryProjectDto } from './dto/query-project.dto';
import { ImportProjectRowSchema } from './dto/import-project.dto';

/* =========================
   Helpers
========================= */

function mapProject(project: Project) {
  return {
    ...project,
    allocatedBudget: Number(project.allocatedBudget),
    internalBudget:  Number(project.internalBudget),
    centralBudget:   Number(project.centralBudget),
    provinceBudget:  Number(project.provinceBudget),
  };
}

function mapImplantedThrough(
  val: string | null | undefined,
): ProjectImplantedThrough | null | undefined {
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
  const parsed  = Number(cleaned);
  if (isNaN(parsed)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(parsed);
}

/* =========================
   Shared include for findOne
   (findAll uses select for performance)
========================= */
const PROJECT_INCLUDE = {
  company:       { select: { id: true, name: true, panNumber: true } },
  userCommittee: { select: { id: true, name: true } },
  // ✅ siteIncharge — matches schema relation "SiteIncharge"
  siteIncharge:  { select: { id: true, name: true, designation: true } },
  // projectManager is commented out in schema — do NOT include it
  contracts: {
    select: {
      id:                     true,
      contractNumber:         true,
      contractAmount:         true,
      status:                 true,
      startDate:              true,
      intendedCompletionDate: true,
      actualCompletionDate:   true,
      siteIncharge: { select: { id: true, name: true, designation: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ProjectInclude;

/* =========================
   Service
========================= */

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  /* ───────────────────────────────────────────
     Create (From UI)
  ─────────────────────────────────────────── */
  async create(dto: CreateProjectDto) {
    const data = CreateProjectSchema.parse(dto);

    // UI DEDUPLICATION: Check if this exact project already exists
    const duplicate = await this.prisma.project.findFirst({
      where: {
        name:       data.name,
        type:       data.type,
        budgetCode: data.budgetCode,
        fiscalYear: data.fiscalYear,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `A project named "${data.name}" already exists for this Ward/Type and Budget Code in ${data.fiscalYear}.`,
      );
    }

    const payload: Prisma.ProjectUncheckedCreateInput = {
      ...data,
      implantedThrough: mapImplantedThrough(data.implantedThrough),
      allocatedBudget:  safeDecimal(data.allocatedBudget),
      internalBudget:   safeDecimal(data.internalBudget),
      centralBudget:    safeDecimal(data.centralBudget),
      provinceBudget:   safeDecimal(data.provinceBudget),
    };

    const project = await this.prisma.project.create({ data: payload });
    return mapProject(project);
  }

  /* ───────────────────────────────────────────
     Find All (paginated, filterable, sortable)
  ─────────────────────────────────────────── */
  async findAll(query: QueryProjectDto) {
    const q    = QueryProjectSchema.parse(query);
    const skip = (q.page - 1) * q.limit;

    const where: Prisma.ProjectWhereInput = {
      ...(q.status     && { status: q.status }),
      ...(q.fiscalYear && { fiscalYear: q.fiscalYear }),
      ...(q.search && {
        OR: [
          { sNo:        { contains: q.search, mode: 'insensitive' } },
          { name:       { contains: q.search, mode: 'insensitive' } },
          { budgetCode: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };

    // sNo requires a raw SQL numeric cast to sort correctly (not alphabetically)
    if (q.sortBy === 'sNo') {
      const direction =
        q.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

      const [data, total] = await Promise.all([
        this.prisma.$queryRaw<Project[]>(Prisma.sql`
          SELECT * FROM "Project"
          WHERE 1=1
          ${q.status     ? Prisma.sql`AND "status"     = ${q.status}`     : Prisma.sql``}
          ${q.fiscalYear ? Prisma.sql`AND "fiscalYear" = ${q.fiscalYear}` : Prisma.sql``}
          ${q.search     ? Prisma.sql`AND (
            "sNo"        ILIKE ${'%' + q.search + '%'} OR
            "name"       ILIKE ${'%' + q.search + '%'} OR
            "budgetCode" ILIKE ${'%' + q.search + '%'}
          )` : Prisma.sql``}
          ORDER BY NULLIF(regexp_replace("sNo", '[^0-9]', '', 'g'), '')::INTEGER ${direction} NULLS LAST
          LIMIT ${q.limit} OFFSET ${skip}
        `),
        this.prisma.project.count({ where }),
      ]);

      return {
        data: data.map(mapProject),
        meta: { page: q.page, limit: q.limit, total },
      };
    }

    // All other columns use standard Prisma orderBy
    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take:    q.limit,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: {
          company:       { select: { name: true } },
          userCommittee: { select: { name: true } },
          // ✅ Include siteIncharge in list view too
          siteIncharge:  { select: { id: true, name: true, designation: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: data.map(mapProject),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  /* ───────────────────────────────────────────
     Find One (full detail)
  ─────────────────────────────────────────── */
  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      // ✅ Uses PROJECT_INCLUDE — projectManager removed (commented out in schema)
      include: PROJECT_INCLUDE,
    });

    if (!project) throw new NotFoundException('Project not found');
    return mapProject(project);
  }

  /* ───────────────────────────────────────────
     Update
  ─────────────────────────────────────────── */
  async update(id: string, dto: UpdateProjectDto) {
    const data = UpdateProjectSchema.parse(dto);

    try {
      const payload: Prisma.ProjectUncheckedUpdateInput = {
        ...data,
        implantedThrough: data.implantedThrough
          ? mapImplantedThrough(data.implantedThrough)
          : undefined,
        allocatedBudget: data.allocatedBudget !== undefined ? safeDecimal(data.allocatedBudget) : undefined,
        internalBudget:  data.internalBudget  !== undefined ? safeDecimal(data.internalBudget)  : undefined,
        centralBudget:   data.centralBudget   !== undefined ? safeDecimal(data.centralBudget)   : undefined,
        provinceBudget:  data.provinceBudget  !== undefined ? safeDecimal(data.provinceBudget)  : undefined,
      };

      const project = await this.prisma.project.update({
        where: { id },
        data:  payload,
      });

      return mapProject(project);
    } catch {
      throw new NotFoundException('Project not found or update failed');
    }
  }

  /* ───────────────────────────────────────────
     Remove
  ─────────────────────────────────────────── */
  async remove(id: string) {
    try {
      await this.prisma.project.delete({ where: { id } });
      return { success: true };
    } catch {
      throw new NotFoundException('Project not found');
    }
  }

  /* ───────────────────────────────────────────
     CSV Import
  ─────────────────────────────────────────── */
  async importCsv(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('CSV file required');

    let csvString = file.buffer.toString('utf8');
    csvString = csvString.replace(/^\uFEFF/, ''); // strip BOM

    const parsed = Papa.parse(csvString, {
      header:         true,
      skipEmptyLines: true,
    });

    const validRows: Prisma.ProjectCreateManyInput[] = [];
    const errors: any[]                              = [];
    let   skippedDuplicates                          = 0;

    // CSV DEDUPLICATION: Fetch existing S.Nos for the fiscal years in the CSV
    const fiscalYearsInCsv = [
      ...new Set(
        (parsed.data as any[]).map((r: any) => r.fiscalYear).filter(Boolean),
      ),
    ];

    const existingProjects = await this.prisma.project.findMany({
      where: {
        fiscalYear: { in: fiscalYearsInCsv as string[] },
        sNo:        { not: null },
      },
      select: { sNo: true, fiscalYear: true },
    });

    // Fast lookup Set: "82-83:15"
    const existingSNoSet = new Set(
      existingProjects.map((p) => `${p.fiscalYear}:${p.sNo}`),
    );

    (parsed.data as any[]).forEach((row: any, index: number) => {
      const result = ImportProjectRowSchema.safeParse(row);

      if (!result.success) {
        errors.push({ row: index + 1, issues: result.error.flatten() });
        return;
      }

      const r      = result.data;
      const sNoStr = r.sNo ? String(r.sNo).trim() : null;

      // Skip if S.No already exists for this fiscal year
      if (sNoStr && r.fiscalYear && existingSNoSet.has(`${r.fiscalYear}:${sNoStr}`)) {
        skippedDuplicates++;
        return;
      }

      validRows.push({
        sNo:              sNoStr,
        name:             r.name.trim(),
        type:             r.type,
        budgetCode:       r.budgetCode,
        fiscalYear:       r.fiscalYear,
        source:           r.source,
        status:           r.status ?? 'NOT_STARTED',
        implantedThrough: mapImplantedThrough(r.implantedThrough) ?? undefined,
        allocatedBudget:  safeDecimal(r.allocatedBudget),
        internalBudget:   safeDecimal(r.internalBudget),
        centralBudget:    safeDecimal(r.centralBudget),
        provinceBudget:   safeDecimal(r.provinceBudget),
      });
    });

    if (validRows.length > 0) {
      await this.prisma.project.createMany({
        data:             validRows,
        skipDuplicates:   true,
      });
    }

    return {
      inserted: validRows.length,
      skipped:  skippedDuplicates,
      failed:   errors.length,
      errors,
    };
  }
}