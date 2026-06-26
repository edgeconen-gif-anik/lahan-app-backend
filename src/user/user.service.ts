// src/user/user.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveUserDto,
  CreateUserDto,
  UpdateUserDto,
  QueryUserDto,
} from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { ApprovalStatus, FuelType, Prisma } from '@prisma/client';
import { AuthUser, isAdminUser, requireAdminUser } from '../auth/auth-user';
import {
  getCurrentNepaliFiscalYear,
  normalizeFiscalYear,
} from '../setup/fiscal-year';

const FISCAL_MONTHS = [
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
  'Baishakh',
  'Jestha',
  'Ashadh',
];

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function getFiscalYearStartDate(fiscalYear: string) {
  const normalized = normalizeFiscalYear(fiscalYear);
  const bsStartYear = Number(normalized?.slice(0, 4));
  const adStartYear = Number.isFinite(bsStartYear)
    ? bsStartYear - 57
    : new Date().getFullYear();

  return new Date(Date.UTC(adStartYear, 6, 16));
}

function getFiscalMonthIndex(logDate: Date, fiscalYearStart: Date) {
  const monthDiff =
    (logDate.getUTCFullYear() - fiscalYearStart.getUTCFullYear()) * 12 +
    (logDate.getUTCMonth() - fiscalYearStart.getUTCMonth());

  return Math.min(Math.max(monthDiff, 0), 11);
}

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private requireSelfOrAdmin(targetUserId: string, requester: AuthUser) {
    if (requester.id === targetUserId || isAdminUser(requester)) {
      return;
    }

    throw new ForbiddenException('You do not have access to this user');
  }

  private getApprovedContractWhere(requester: AuthUser): Prisma.ContractWhereInput {
    if (isAdminUser(requester)) {
      return {};
    }

    return {
      approvalStatus: ApprovalStatus.APPROVED,
    };
  }

  /* ───────────────────────────────────────────
     1. Create User
  ─────────────────────────────────────────── */
  async create(createUserDto: CreateUserDto, requester: AuthUser) {
    requireAdminUser(requester);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    let hashedPassword: string | undefined;
    if (createUserDto.password) {
      hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userData } = createUserDto;

    return this.prisma.user.create({
      data: { ...userData, password: hashedPassword },
    });
  }

  /* ───────────────────────────────────────────
     2. Find All (Search, Filter, Paginate)
  ─────────────────────────────────────────── */
  async findAll(query: QueryUserDto, requester: AuthUser) {
    requireAdminUser(requester);

    const { search, designation, role, approvalStatus, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      AND: [
        search
          ? {
              OR: [
                { name:  { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
        designation ? { designation } : {},
        role        ? { role }        : {},
        approvalStatus ? { approvalStatus } : {},
      ],
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:            true,
          name:          true,
          email:         true,
          role:          true,
          designation:   true,
          approvalStatus: true,
          image:         true,
          createdAt:     true,
          updatedAt:     true,  // ✅ added
          emailVerified: true,
        },
      }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /* ───────────────────────────────────────────
     3. Find One (basic info)
  ─────────────────────────────────────────── */
  async findOne(id: string, requester: AuthUser) {
    this.requireSelfOrAdmin(id, requester);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id:            true,
        name:          true,
        email:         true,
        role:          true,
        designation:   true,
        approvalStatus: true,
        image:         true,
        createdAt:     true,
        updatedAt:     true,
        emailVerified: true,
        // never return password
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  /* ───────────────────────────────────────────
     4. Get Full Profile
        GET /users/:id/profile
        Returns projects as site incharge + nested
        contracts + computed stats per project
  ─────────────────────────────────────────── */
  async getProfile(id: string, requester: AuthUser) {
    this.requireSelfOrAdmin(id, requester);
    const approvedContractWhere = this.getApprovedContractWhere(requester);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id:          true,
        name:        true,
        email:       true,
        role:        true,
        designation: true,
        approvalStatus: true,
        image:       true,
        createdAt:   true,

        // ✅ Projects where this user is site incharge
        // Relation name from schema: "SiteIncharge"
        siteInchargeProjects: {
          select: {
            id:              true,
            name:            true,
            sNo:             true,
            status:          true,
            fiscalYear:      true,
            budgetCode:      true,
            allocatedBudget: true,
            internalBudget:  true,
            centralBudget:   true,
            provinceBudget:  true,

            // All contracts under each project
            contracts: {
              where: approvedContractWhere,
              select: {
                id:                     true,
                contractNumber:         true,
                contractAmount:         true,
                status:                 true,
                startDate:              true,
                intendedCompletionDate: true,
                actualCompletionDate:   true,
                remarks:                true,
                createdAt:              true,
                // ✅ contract's own site incharge (may differ from project's)
                siteIncharge:  { select: { id: true, name: true, designation: true } },
                company:       { select: { id: true, name: true } },
                userCommittee: { select: { id: true, name: true } },
                agreement:     { select: { id: true, agreementDate: true } },
                workOrder:     { select: { id: true, issuedDate: true } },
              },
              orderBy: { createdAt: 'desc' as const },
            },
          },
          orderBy: { createdAt: 'desc' as const },
        },

        // ✅ Contracts directly assigned to this user as site incharge
        // Relation name from schema: "ContractSiteIncharge"
        managedContracts: {
          where: approvedContractWhere,
          select: {
            id:                     true,
            contractNumber:         true,
            contractAmount:         true,
            status:                 true,
            startDate:              true,
            intendedCompletionDate: true,
            actualCompletionDate:   true,
            project: {
              select: { id: true, name: true, sNo: true, status: true },
            },
            company:       { select: { id: true, name: true } },
            userCommittee: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' as const },
        },
      },
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);

    const settings = await this.prisma.systemSetting.findUnique({
      where: { id: 'default' },
      select: { currentFiscalYear: true },
    });
    const currentFiscalYear =
      normalizeFiscalYear(settings?.currentFiscalYear) ??
      getCurrentNepaliFiscalYear();
    const fiscalYearStart = getFiscalYearStartDate(currentFiscalYear);
    const fiscalYearEnd = new Date(fiscalYearStart);
    fiscalYearEnd.setUTCFullYear(fiscalYearEnd.getUTCFullYear() + 1);

    const fuelLogs = await this.prisma.fuelLog.findMany({
      where: {
        userId: id,
        approvalStatus: ApprovalStatus.APPROVED,
        OR: [
          { logDate: { gte: fiscalYearStart, lt: fiscalYearEnd } },
          { project: { fiscalYear: currentFiscalYear } },
          { contract: { fiscalYear: currentFiscalYear } },
        ],
      },
      select: {
        fuelType: true,
        quantityLiters: true,
        totalAmount: true,
        logDate: true,
      },
      orderBy: { logDate: 'asc' as const },
    });

    const fuelUsageMonths = FISCAL_MONTHS.map((month, index) => ({
      key: `${currentFiscalYear}-${index + 1}`,
      month,
      monthIndex: index + 1,
      petrolLiters: 0,
      dieselLiters: 0,
      totalLiters: 0,
      totalAmount: 0,
      logCount: 0,
    }));

    for (const fuelLog of fuelLogs) {
      const monthIndex = getFiscalMonthIndex(fuelLog.logDate, fiscalYearStart);
      const month = fuelUsageMonths[monthIndex];
      const quantityLiters = toNumber(fuelLog.quantityLiters);
      const totalAmount = toNumber(fuelLog.totalAmount);

      if (fuelLog.fuelType === FuelType.PETROL) {
        month.petrolLiters += quantityLiters;
      } else {
        month.dieselLiters += quantityLiters;
      }

      month.totalLiters += quantityLiters;
      month.totalAmount += totalAmount;
      month.logCount += 1;
    }

    const fuelUsage = {
      fiscalYear: currentFiscalYear,
      totalLiters: fuelUsageMonths.reduce(
        (sum, month) => sum + month.totalLiters,
        0,
      ),
      totalAmount: fuelUsageMonths.reduce(
        (sum, month) => sum + month.totalAmount,
        0,
      ),
      months: fuelUsageMonths,
    };

    // ── Per-project computed stats ─────────────────────────────────────────
    const projectsWithStats = user.siteInchargeProjects.map((project) => {
      const totalContractValue = project.contracts.reduce(
        (sum, c) => sum + Number(c.contractAmount),
        0,
      );

      const statusBreakdown = project.contracts.reduce(
        (acc, c) => {
          acc[c.status] = (acc[c.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        ...project,
        allocatedBudget: Number(project.allocatedBudget),
        internalBudget:  Number(project.internalBudget),
        centralBudget:   Number(project.centralBudget),
        provinceBudget:  Number(project.provinceBudget),
        contractCount:   project.contracts.length,
        totalContractValue,
        statusBreakdown,
      };
    });

    // ── Overall summary ────────────────────────────────────────────────────
    const summary = {
      totalProjectsAsSiteIncharge: projectsWithStats.length,
      totalContractsAsSiteIncharge: user.managedContracts.length,
      totalContractValueAsSiteIncharge: user.managedContracts.reduce(
        (s, c) => s + Number(c.contractAmount),
        0,
      ),
      // Contracts via project inheritance
      totalProjectContracts: projectsWithStats.reduce(
        (s, p) => s + p.contractCount,
        0,
      ),
      totalProjectContractValue: projectsWithStats.reduce(
        (s, p) => s + p.totalContractValue,
        0,
      ),
    };

    return {
      id:          user.id,
      name:        user.name,
      email:       user.email,
      role:        user.role,
      designation: user.designation,
      image:       user.image,
      createdAt:   user.createdAt,
      summary,
      fuelUsage,
      siteInchargeProjects: projectsWithStats,
      managedContracts:     user.managedContracts,
    };
  }

  /* ───────────────────────────────────────────
     5. Dashboard (lightweight counts + recent)
        GET /users/:id/dashboard
  ─────────────────────────────────────────── */
  async getUserDashboard(userId: string, requester: AuthUser) {
    this.requireSelfOrAdmin(userId, requester);
    const approvedContractWhere = this.getApprovedContractWhere(requester);

    const [
      user,
      totalManagedContracts,
      projectStatusCounts,
      totalProjects,
      budgetSummary,
      completedProjects,
      usersForRanking,
    ] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id:          true,
          name:        true,
          designation: true,
          email:       true,
          _count: {
            select: {
              siteInchargeProjects: true,
            },
          },
          siteInchargeProjects: {
            take:    5,
            orderBy: { updatedAt: 'desc' as const },
            select: {
              id:              true,
              name:            true,
              status:          true,
              allocatedBudget: true,
              fiscalYear:      true,
            },
          },
          managedContracts: {
            where: approvedContractWhere,
            take:    5,
            orderBy: { updatedAt: 'desc' as const },
            select: {
              id:             true,
              contractNumber: true,
              contractAmount: true,
              status:         true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.contract.count({
        where: {
          siteInchargeId: userId,
          ...approvedContractWhere,
        },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' as const },
        _count: true,
      }),
      this.prisma.project.count(),
      this.prisma.project.aggregate({
        _sum: {
          allocatedBudget: true,
          internalBudget: true,
          centralBudget: true,
          provinceBudget: true,
        },
      }),
      this.prisma.project.findMany({
        where: { status: 'COMPLETED' },
        take: 6,
        orderBy: { updatedAt: 'desc' as const },
        select: {
          id: true,
          name: true,
          status: true,
          allocatedBudget: true,
          fiscalYear: true,
          sNo: true,
          siteIncharge: {
            select: { id: true, name: true, designation: true, image: true },
          },
          contracts: {
            where: { siteInchargeId: { not: null } },
            take: 1,
            orderBy: { updatedAt: 'desc' as const },
            select: {
              siteIncharge: {
                select: { id: true, name: true, designation: true, image: true },
              },
            },
          },
        },
      }),
      this.prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          designation: true,
          image: true,
          siteInchargeProjects: {
            select: { id: true },
          },
          managedContracts: {
            select: { projectId: true },
          },
          _count: {
            select: {
              managedContracts: true,
            },
          },
        },
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    const statusCounts = projectStatusCounts.reduce(
      (acc, item) => {
        const count =
          typeof item._count === 'number'
            ? item._count
            : typeof item._count === 'object' && item._count !== null
              ? item._count._all
              : 0;
        acc[item.status] = count ?? 0;
        return acc;
      },
      {
        NOT_STARTED: 0,
        ONGOING: 0,
        COMPLETED: 0,
        ARCHIVED: 0,
      } as Record<string, number>,
    );
    const completedProjectCount = statusCounts.COMPLETED ?? 0;

    return {
      userProfile: {
        id:          user.id,
        name:        user.name,
        designation: user.designation,
        email:       user.email,
      },
      stats: {
        totalProjects,
        totalBudget: Number(budgetSummary._sum.allocatedBudget ?? 0),
        internalBudget: Number(budgetSummary._sum.internalBudget ?? 0),
        centralBudget: Number(budgetSummary._sum.centralBudget ?? 0),
        provinceBudget: Number(budgetSummary._sum.provinceBudget ?? 0),
        completedProjects: completedProjectCount,
        ongoingProjects: statusCounts.ONGOING ?? 0,
        notStartedProjects: statusCounts.NOT_STARTED ?? 0,
        archivedProjects: statusCounts.ARCHIVED ?? 0,
        completionRate:
          totalProjects > 0
            ? Math.round((completedProjectCount / totalProjects) * 100)
            : 0,
        totalSiteInchargeProjects: user._count.siteInchargeProjects,
        totalManagedContracts,
      },
      recentProjects:  user.siteInchargeProjects.map((p) => ({
        ...p,
        allocatedBudget: Number(p.allocatedBudget),
      })),
      recentContracts: user.managedContracts.map((c) => ({
        ...c,
        contractAmount: Number(c.contractAmount),
      })),
      completedProjects: completedProjects.map((project) => {
        const { contracts, ...projectData } = project;
        const contractSiteIncharge = contracts[0]?.siteIncharge ?? null;

        return {
          ...projectData,
          allocatedBudget: Number(project.allocatedBudget),
          siteIncharge: project.siteIncharge ?? contractSiteIncharge,
        };
      }),
      topUsersByProjects: usersForRanking
        .map((topUser) => {
          const projectIds = new Set([
            ...topUser.siteInchargeProjects.map((project) => project.id),
            ...topUser.managedContracts.map((contract) => contract.projectId),
          ]);

          return {
            id: topUser.id,
            name: topUser.name,
            email: topUser.email,
            designation: topUser.designation,
            image: topUser.image,
            projectCount: projectIds.size,
            contractCount: topUser._count.managedContracts,
          };
        })
        .filter((topUser) => topUser.projectCount > 0)
        .sort((a, b) => b.projectCount - a.projectCount)
        .slice(0, 3),
    };
  }

  /* ───────────────────────────────────────────
     6. Update User
  ─────────────────────────────────────────── */
  async update(id: string, updateUserDto: UpdateUserDto, requester: AuthUser) {
    requireAdminUser(requester);
    await this.findOne(id, requester);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data:  updateUserDto,
    });
  }

  async approve(id: string, approveUserDto: ApproveUserDto, requester: AuthUser) {
    requireAdminUser(requester);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'User must verify their email before admin approval',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        role: approveUserDto.role,
        designation: approveUserDto.designation,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        designation: true,
        approvalStatus: true,
        emailVerified: true,
      },
    });
  }

  /* ───────────────────────────────────────────
     7. Delete User
  ─────────────────────────────────────────── */
  async remove(id: string, requester: AuthUser) {
    requireAdminUser(requester);
    await this.findOne(id, requester);
    return this.prisma.user.delete({ where: { id } });
  }

  /* ───────────────────────────────────────────
     Helper: Find by Email (internal / auth use)
  ─────────────────────────────────────────── */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
