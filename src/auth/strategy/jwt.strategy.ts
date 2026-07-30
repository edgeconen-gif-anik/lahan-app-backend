import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { getIdleSessionExpiry } from '../session-config';
import { ApprovalStatus } from '@prisma/client';
import { getJwtSecret } from '../jwt-secret';

type JwtPayload = {
  sub: string;
  sid?: string;
  email: string;
  role?: string | null;
  designation?: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload.sid) {
      throw new UnauthorizedException('Session is invalid');
    }

    try {
      const now = new Date();
      const session = await this.prisma.session.findUnique({
        where: { sessionToken: payload.sid },
        select: {
          sessionToken: true,
          userId: true,
          expires: true,
          user: {
            select: {
              email: true,
              role: true,
              designation: true,
              approvalStatus: true,
            },
          },
        },
      });

      if (!session || session.userId !== payload.sub) {
        throw new UnauthorizedException('Session is invalid');
      }

      if (session.expires.getTime() <= now.getTime()) {
        await this.prisma.session.deleteMany({
          where: { sessionToken: payload.sid },
        });

        throw new UnauthorizedException('Session expired due to inactivity');
      }

      if (session.user.approvalStatus !== ApprovalStatus.APPROVED) {
        await this.prisma.session.deleteMany({
          where: { userId: session.userId },
        });

        throw new UnauthorizedException('User account is not approved');
      }

      await this.prisma.session.update({
        where: { sessionToken: session.sessionToken },
        data: { expires: getIdleSessionExpiry(now) },
      });

      return {
        id: payload.sub,
        email: session.user.email ?? payload.email,
        sessionToken: session.sessionToken,
        role: session.user.role,
        designation: session.user.designation,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Unable to validate session', error);
      throw new UnauthorizedException('Unable to verify session');
    }
  }
}
