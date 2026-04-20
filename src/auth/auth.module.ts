import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module'; // Import UserModule
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AUTH_ACCESS_TOKEN_MAX_AGE } from './session-config';

@Module({
  imports: [
    UserModule,
    PassportModule,
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        process.env.JWT_SECRET_KEY ||
        'secretKey', // Use a .env var in production!
      signOptions: { expiresIn: AUTH_ACCESS_TOKEN_MAX_AGE },
    }),
  ],
  providers: [AuthService, PrismaService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
