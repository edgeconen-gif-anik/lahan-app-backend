import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module'; // Import UserModule
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AUTH_ACCESS_TOKEN_MAX_AGE } from './session-config';
import { MailModule } from '../mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';

@Module({
  imports: [
    UserModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: AUTH_ACCESS_TOKEN_MAX_AGE },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
