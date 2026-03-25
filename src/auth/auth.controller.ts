import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  Request,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guard/jwt-auth.guard';

// DTOs
class LoginDto {
  email: string;
  password: string;
}

class GoogleLoginDto {
  token?: string;
  email: string;
  name?: string;
  image?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ==========================
  // 1. Credentials Login
  // ==========================
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    console.log('📥 Login attempt for:', loginDto.email);
    
    if (!loginDto.email || !loginDto.password) {
      throw new BadRequestException('Email and password are required');
    }

    // Validate user credentials
    const user = await this.authService.validateUser(
      loginDto.email, 
      loginDto.password
    );

    if (!user) {
      console.log('❌ Invalid credentials for:', loginDto.email);
      throw new UnauthorizedException('Invalid email or password');
    }

    console.log('✅ Login successful for:', loginDto.email);
    // Generate JWT and return user data
    return this.authService.login(user);
  }

  // ==========================
  // 2. Google OAuth Login
  // ==========================
  @Post('google-login')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() googleDto: GoogleLoginDto) {
    console.log('📥 Google login attempt for:', googleDto.email);
    
    if (!googleDto.email) {
      throw new BadRequestException('Email is required');
    }

    try {
      // Find or create user based on Google data
      const user = await this.authService.findOrCreateGoogleUser(googleDto);
      
      console.log('✅ Google login successful for:', googleDto.email);
      // Generate JWT and return user data
      return this.authService.login(user);
    } catch (error) {
      console.error('❌ Google login error:', error);
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  // ==========================
  // 3. Get Current User (Protected)
  // ==========================
  @UseGuards(JwtAuthGuard)
  @Post('me')
  @HttpCode(HttpStatus.OK)
  async getProfile(@Request() req) {
    return {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      designation: req.user.designation,
    };
  }

  // ==========================
  // 4. Verify Token (Protected)
  // ==========================
  @UseGuards(JwtAuthGuard)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyToken(@Request() req) {
    return {
      valid: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }
}