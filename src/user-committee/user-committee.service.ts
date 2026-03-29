import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserCommitteeDto,
  UpdateUserCommitteeDto,
  QueryUserCommitteeDto,
} from './dto/user-committee.dto';
import { CommitteeRole, Prisma } from '@prisma/client';
import {
  AuthUser,
  getApprovalStateForSave,
  getApprovalVisibilityWhere,
  requireAdminUser,
} from '../auth/auth-user';

@Injectable()
export class UserCommitteeService {
  constructor(private prisma: PrismaService) {}

  private validateLeadershipRoles(
    officials?: {
      role: CommitteeRole;
    }[],
  ) {
    if (!officials || officials.length === 0) {
      throw new BadRequestException('Committee must include officials.');
    }

    const leadershipCount = {
      PRESIDENT: 0,
      SECRETARY: 0,
      TREASURER: 0,
    };

    for (const official of officials) {
      if (official.role in leadershipCount) {
        leadershipCount[official.role as keyof typeof leadershipCount]++;
      }
    }

    if (leadershipCount.PRESIDENT !== 1) {
      throw new BadRequestException(
        'Committee must have exactly one PRESIDENT.',
      );
    }

    if (leadershipCount.SECRETARY !== 1) {
      throw new BadRequestException(
        'Committee must have exactly one SECRETARY.',
      );
    }

    if (leadershipCount.TREASURER !== 1) {
      throw new BadRequestException(
        'Committee must have exactly one TREASURER.',
      );
    }
  }

  async create(dto: CreateUserCommitteeDto, user: AuthUser) {
    const { officials, formedDate, ...rest } = dto;

    this.validateLeadershipRoles(officials);

    return this.prisma.userCommittee.create({
      data: {
        ...rest,
        formedDate: formedDate!,
        ...getApprovalStateForSave(user),
        officials: {
          create: officials!,
        },
      },
      include: {
        officials: true,
      },
    });
  }

  async findAll(query: QueryUserCommitteeDto, user: AuthUser) {
    const { search, fiscalYear, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserCommitteeWhereInput = {
      AND: [
        getApprovalVisibilityWhere(user),
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                {
                  officials: {
                    some: {
                      role: { in: ['PRESIDENT', 'TREASURER'] },
                      name: { contains: search, mode: 'insensitive' },
                    },
                  },
                },
              ],
            }
          : {},
        fiscalYear ? { fiscalYear } : {},
      ],
    };

    const [total, committees] = await this.prisma.$transaction([
      this.prisma.userCommittee.count({ where }),
      this.prisma.userCommittee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { officials: true },
      }),
    ]);

    return {
      data: committees,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const committee = await this.prisma.userCommittee.findFirst({
      where: { id, ...getApprovalVisibilityWhere(user) },
      include: {
        officials: true,
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            allocatedBudget: true,
          },
        },
      },
    });

    if (!committee) {
      throw new NotFoundException(
        `User Committee with ID ${id} not found`,
      );
    }

    return committee;
  }

  async update(id: string, dto: UpdateUserCommitteeDto, user: AuthUser) {
    await this.findOne(id, user);

    const { officials, formedDate, ...rest } = dto;

    if (officials) {
      this.validateLeadershipRoles(officials);
    }

    return this.prisma.userCommittee.update({
      where: { id },
      data: {
        ...rest,
        ...getApprovalStateForSave(user),
        ...(formedDate && { formedDate }),
        ...(officials && {
          officials: {
            deleteMany: {},
            create: officials,
          },
        }),
      },
      include: {
        officials: true,
      },
    });
  }

  async approve(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);

    return this.prisma.userCommittee.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
      },
      include: {
        officials: true,
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);

    return this.prisma.$transaction([
      this.prisma.committeeOfficial.deleteMany({
        where: { userCommitteeId: id },
      }),
      this.prisma.userCommittee.delete({
        where: { id },
      }),
    ]);
  }
}
