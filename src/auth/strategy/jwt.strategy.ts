import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { getIdleSessionExpiry } from '../session-config';

type JwtPayload = {
  sub: string;
  sid?: string;
  email: string;
  role?: string | null;
  designation?: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || 'secretKey',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload.sid) {
      throw new UnauthorizedException('Session is invalid');
    }

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { sessionToken: payload.sid },
      select: {
        sessionToken: true,
        userId: true,
        expires: true,
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

    await this.prisma.session.update({
      where: { sessionToken: session.sessionToken },
      data: { expires: getIdleSessionExpiry(now) },
    });

    return {
      id: payload.sub,
      email: payload.email,
      sessionToken: session.sessionToken,
      role: payload.role as AuthUser['role'],
      designation: payload.designation,
    };
  }
}
