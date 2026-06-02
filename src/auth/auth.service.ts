import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { PrismaService } from '../prisma/prisma.service';
import { getIdleSessionExpiry } from './session-config';
import { MailService } from '../mail/mail.service';
import { SignupDto } from './dto/auth.dto';
import { ApprovalStatus } from '@prisma/client';

interface GoogleUserDto {
  email: string;
  name?: string;
  image?: string;
  token: string;
}

type VerifiedGoogleUser = {
  email: string;
  name?: string;
  image?: string;
};

const PASSWORD_RESET_PREFIX = 'password-reset:';
const PASSWORD_RESET_TTL_MINUTES = 15;
const PASSWORD_RESET_MESSAGE =
  'If an account with that email exists, a password reset link has been generated.';
const EMAIL_VERIFY_PREFIX = 'email-verify:';
const EMAIL_VERIFY_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const user = await this.usersService.findByEmail(normalizedEmail);

      if (!user) {
        this.logger.debug(`Invalid login attempt for ${normalizedEmail}`);
        return null;
      }

      if (!user.password) {
        this.logger.debug(`Password login unavailable for ${normalizedEmail}`);
        return null;
      }

      if (!this.canUserLogin(user)) {
        this.logger.debug(`Login blocked for onboarding user ${normalizedEmail}`);
        return null;
      }

      const isMatch = await bcrypt.compare(pass, user.password);

      if (isMatch) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...result } = user;
        return result;
      }

      this.logger.debug(`Invalid login attempt for ${normalizedEmail}`);
      return null;
    } catch (error) {
      this.logger.error('Error while validating credentials', error);
      return null;
    }
  }

  async login(user: any) {
    if (!this.canUserLogin(user)) {
      throw new UnauthorizedException(
        'Admin approval is required before sign in',
      );
    }

    const now = new Date();

    await this.prisma.session.deleteMany({
      where: {
        userId: user.id,
        expires: { lt: now },
      },
    });

    const session = await this.prisma.session.create({
      data: {
        sessionToken: randomBytes(32).toString('hex'),
        userId: user.id,
        expires: getIdleSessionExpiry(now),
      },
    });

    const payload = {
      email: user.email,
      sub: user.id,
      sid: session.sessionToken,
      role: user.role,
      designation: user.designation,
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`Login session created for ${user.email}`);

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

  async logout(sessionToken?: string) {
    if (sessionToken) {
      await this.prisma.session.deleteMany({
        where: { sessionToken },
      });
    }

    return { message: 'Logged out' };
  }

  async findOrCreateGoogleUser(googleDto: GoogleUserDto) {
    try {
      const googleUser = await this.verifyGoogleUser(googleDto);
      let user = await this.usersService.findByEmail(googleUser.email);

      if (user) {
        this.logger.log(
          `Existing user found for Google login: ${googleUser.email}`,
        );

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            name: googleUser.name || user.name,
            image: googleUser.image || user.image,
            emailVerified: new Date(),
          },
        });
      } else {
        this.logger.log(
          `Creating new user from Google login: ${googleUser.email}`,
        );

        user = await this.prisma.user.create({
          data: {
            email: googleUser.email,
            name: googleUser.name,
            image: googleUser.image,
            emailVerified: new Date(),
            approvalStatus: ApprovalStatus.PENDING,
          },
        });

        this.logger.log(`New Google user created: ${user.id}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
    } catch (error) {
      this.logger.error('Error in findOrCreateGoogleUser', error);
      throw error;
    }
  }

  private async verifyGoogleUser(
    googleDto: GoogleUserDto,
  ): Promise<VerifiedGoogleUser> {
    const clientId =
      process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      this.logger.error(
        'GOOGLE_CLIENT_ID is required for backend Google login',
      );
      throw new UnauthorizedException('Google login is not configured');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: googleDto.token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const verifiedEmail = payload?.email?.trim().toLowerCase();
    const requestedEmail = googleDto.email.trim().toLowerCase();

    if (!verifiedEmail || payload?.email_verified !== true) {
      throw new UnauthorizedException('Google email is not verified');
    }

    if (verifiedEmail !== requestedEmail) {
      throw new UnauthorizedException('Google email does not match token');
    }

    return {
      email: verifiedEmail,
      name: payload.name || googleDto.name,
      image: payload.picture || googleDto.image,
    };
  }

  async verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user?.email) {
      throw new NotFoundException('This email is not registered with us.');
    }

    const identifier = this.getPasswordResetIdentifier(normalizedEmail);
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashResetToken(rawToken);
    const expires = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

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

    const frontendUrl = (
      process.env.FRONTEND_URL || 'https://lahan-app-frontend.onrender.com'
    ).replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    let emailSent = false;

    try {
      emailSent = await this.mailService.sendPasswordResetEmail({
        to: normalizedEmail,
        resetUrl,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Unable to send password reset email to ${normalizedEmail}`,
        error,
      );
    }

    if (!emailSent && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Unable to send password reset email right now. Please try again later.',
      );
    }

    return {
      message: PASSWORD_RESET_MESSAGE,
      ...(this.shouldExposeResetUrl(emailSent) ? { resetUrl } : {}),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = this.hashToken(token);
    const verificationToken = await this.prisma.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!verificationToken || verificationToken.expires < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const email = this.getEmailFromPasswordResetIdentifier(
      verificationToken.identifier,
    );

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

  async signup(dto: SignupDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const identifier = this.getEmailVerifyIdentifier(normalizedEmail);
    const expires = new Date(
      Date.now() + EMAIL_VERIFY_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          name: dto.name,
          email: normalizedEmail,
          password: passwordHash,
          approvalStatus: ApprovalStatus.PENDING,
        },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { identifier },
      }),
      this.prisma.verificationToken.create({
        data: {
          identifier,
          token: hashedToken,
          expires,
        },
      }),
    ]);

    const frontendUrl = this.getFrontendUrl();
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawToken}`;

    let emailSent = false;
    try {
      emailSent = await this.mailService.sendEmailVerificationEmail({
        to: normalizedEmail,
        verifyUrl,
        expiresInMinutes: EMAIL_VERIFY_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `Unable to send email verification to ${normalizedEmail}`,
        error,
      );
    }

    if (!emailSent && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Unable to send verification email right now. Please try again later.',
      );
    }

    return {
      message:
        'Account created. Verify your email, then wait for admin approval.',
      ...(this.shouldExposeResetUrl(emailSent) ? { verifyUrl } : {}),
    };
  }

  async verifyEmail(token: string) {
    const hashedToken = this.hashToken(token);
    const verificationToken = await this.prisma.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!verificationToken || verificationToken.expires < new Date()) {
      throw new BadRequestException(
        'Verification token is invalid or has expired',
      );
    }

    const email = this.getEmailFromVerifyIdentifier(
      verificationToken.identifier,
    );

    if (!email) {
      await this.prisma.verificationToken.delete({
        where: { token: hashedToken },
      });
      throw new BadRequestException(
        'Verification token is invalid or has expired',
      );
    }

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.prisma.verificationToken.deleteMany({
        where: { identifier: verificationToken.identifier },
      });
      throw new BadRequestException(
        'Verification token is invalid or has expired',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { identifier: verificationToken.identifier },
      }),
    ]);

    return {
      message:
        'Email verified. Your account is waiting for administrator approval.',
    };
  }

  private hashResetToken(token: string) {
    return this.hashToken(token);
  }

  private hashToken(token: string) {
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

  private getEmailVerifyIdentifier(email: string) {
    return `${EMAIL_VERIFY_PREFIX}${email}`;
  }

  private getEmailFromVerifyIdentifier(identifier: string) {
    if (!identifier.startsWith(EMAIL_VERIFY_PREFIX)) {
      return null;
    }

    return identifier.slice(EMAIL_VERIFY_PREFIX.length);
  }

  private getFrontendUrl() {
    return (
      process.env.FRONTEND_URL || 'https://lahan-app-frontend.onrender.com'
    ).replace(/\/$/, '');
  }

  private canUserLogin(user: {
    approvalStatus?: ApprovalStatus | null;
  }) {
    return user.approvalStatus === ApprovalStatus.APPROVED;
  }

  private shouldExposeResetUrl(emailSent: boolean) {
    return !emailSent && process.env.NODE_ENV !== 'production';
  }
}
