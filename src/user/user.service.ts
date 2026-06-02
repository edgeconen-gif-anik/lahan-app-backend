// src/user/user.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { AuthUser, isAdminUser, requireAdminUser } from '../auth/auth-user';

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

    const { search, designation, role, page, limit } = query;
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
      topUsersByProjects,
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
        },
      }),
      this.prisma.user.findMany({
        take: 3,
        orderBy: {
          siteInchargeProjects: {
            _count: 'desc',
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          designation: true,
          image: true,
          _count: {
            select: {
              siteInchargeProjects: true,
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
      completedProjects: completedProjects.map((project) => ({
        ...project,
        allocatedBudget: Number(project.allocatedBudget),
      })),
      topUsersByProjects: topUsersByProjects.map((topUser) => ({
        id: topUser.id,
        name: topUser.name,
        email: topUser.email,
        designation: topUser.designation,
        image: topUser.image,
        projectCount: topUser._count.siteInchargeProjects,
        contractCount: topUser._count.managedContracts,
      })),
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
