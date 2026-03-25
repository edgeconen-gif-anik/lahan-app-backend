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
import { Prisma, CommitteeRole } from '@prisma/client';

@Injectable()
export class UserCommitteeService {
  constructor(private prisma: PrismaService) {}

  // =====================================================
  // 🔒 Leadership Role Validation (Business Rule)
  // =====================================================
  private validateLeadershipRoles(
    officials?: {
      role: CommitteeRole;
    }[],
  ) {
    if (!officials || officials.length === 0) {
      throw new BadRequestException(
        'Committee must include officials.',
      );
    }

    const leadershipCount = {
      PRESIDENT: 0,
      SECRETARY: 0,
      TREASURER: 0,
    };

    for (const official of officials) {
      if (official.role in leadershipCount) {
        leadershipCount[
          official.role as keyof typeof leadershipCount
        ]++;
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

  // ==========================
  // 1️⃣ Create
  // ==========================
  async create(dto: CreateUserCommitteeDto) {
    const { officials, formedDate, ...rest } = dto;

    this.validateLeadershipRoles(officials);

    return this.prisma.userCommittee.create({
      data: {
        ...rest,
        formedDate: formedDate!, // required
        officials: {
          create: officials!,
        },
      },
      include: {
        officials: true,
      },
    });
  }

  // ==========================
  // 2️⃣ Find All
  // ==========================
  async findAll(query: QueryUserCommitteeDto) {
    const { search, fiscalYear, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserCommitteeWhereInput = {
      AND: [
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

  // ==========================
  // 3️⃣ Find One
  // ==========================
  async findOne(id: string) {
    const committee = await this.prisma.userCommittee.findUnique({
      where: { id },
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

  // ==========================
  // 4️⃣ Update
  // ==========================
  async update(id: string, dto: UpdateUserCommitteeDto) {
    await this.findOne(id);

    const { officials, formedDate, ...rest } = dto;

    if (officials) {
      this.validateLeadershipRoles(officials);
    }

    return this.prisma.userCommittee.update({
      where: { id },
      data: {
        ...rest,
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

  // ==========================
  // 5️⃣ Delete
  // ==========================
  async remove(id: string) {
    await this.findOne(id);

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