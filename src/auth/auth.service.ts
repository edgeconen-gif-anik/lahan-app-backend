import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { PrismaService } from '../prisma/prisma.service';

interface GoogleUserDto {
  email: string;
  name?: string;
  image?: string;
  token?: string;
}

const PASSWORD_RESET_PREFIX = 'password-reset:';
const PASSWORD_RESET_TTL_MINUTES = 15;
const PASSWORD_RESET_MESSAGE =
  'If an account with that email exists, a password reset link has been generated.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    try {
      const user = await this.usersService.findByEmail(email);

      if (!user) {
        console.log('User not found:', email);
        return null;
      }

      if (!user.password) {
        console.log('No password set for user:', email);
        console.log('   (This user may have registered via Google)');
        return null;
      }

      const isMatch = await bcrypt.compare(pass, user.password);

      if (isMatch) {
        console.log('Password match for:', email);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...result } = user;
        return result;
      }

      console.log('Password mismatch for:', email);
      return null;
    } catch (error) {
      console.error('Error in validateUser:', error);
      return null;
    }
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      designation: user.designation,
    };

    const accessToken = this.jwtService.sign(payload);

    console.log('JWT generated for:', user.email);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      designation: user.designation,
      image: user.image,
      accessToken,
    };
  }

  async findOrCreateGoogleUser(googleDto: GoogleUserDto) {
    try {
      let user = await this.usersService.findByEmail(googleDto.email);

      if (user) {
        console.log('Existing user found for Google login:', googleDto.email);

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            name: googleDto.name || user.name,
            image: googleDto.image || user.image,
            emailVerified: new Date(),
          },
        });
      } else {
        console.log('Creating new user from Google login:', googleDto.email);

        user = await this.prisma.user.create({
          data: {
            email: googleDto.email,
            name: googleDto.name,
            image: googleDto.image,
            emailVerified: new Date(),
          },
        });

        console.log('New user created:', user.id);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
    } catch (error) {
      console.error('Error in findOrCreateGoogleUser:', error);
      throw error;
    }
  }

  async verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user?.email) {
      return { message: PASSWORD_RESET_MESSAGE };
    }

    const identifier = this.getPasswordResetIdentifier(normalizedEmail);
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashResetToken(rawToken);
    const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    await this.prisma.verificationToken.deleteMany({
      where: { identifier },
    });

    await this.prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires,
      },
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    console.log(`Password reset link for ${normalizedEmail}: ${resetUrl}`);

    return {
      message: PASSWORD_RESET_MESSAGE,
      resetUrl,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = this.hashResetToken(token);
    const verificationToken = await this.prisma.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!verificationToken || verificationToken.expires < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const email = this.getEmailFromPasswordResetIdentifier(verificationToken.identifier);

    if (!email) {
      await this.prisma.verificationToken.delete({
        where: { token: hashedToken },
      });
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.prisma.verificationToken.deleteMany({
        where: { identifier: verificationToken.identifier },
      });
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { identifier: verificationToken.identifier },
      }),
    ]);

    return { message: 'Password reset successful' };
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getPasswordResetIdentifier(email: string) {
    return `${PASSWORD_RESET_PREFIX}${email}`;
  }

  private getEmailFromPasswordResetIdentifier(identifier: string) {
    if (!identifier.startsWith(PASSWORD_RESET_PREFIX)) {
      return null;
    }

    return identifier.slice(PASSWORD_RESET_PREFIX.length);
  }
}
