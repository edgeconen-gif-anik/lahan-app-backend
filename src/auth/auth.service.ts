import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

interface GoogleUserDto {
  email: string;
  name?: string;
  image?: string;
  token?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  // ==========================
  // Validate User (Credentials)
  // ==========================
  async validateUser(email: string, pass: string): Promise<any> {
    try {
      // 1. Find user by email
      const user = await this.usersService.findByEmail(email);
      
      if (!user) {
        console.log('❌ User not found:', email);
        return null;
      }
      
      // 2. Check if user has a password (might not if they only use Google)
      if (!user.password) {
        console.log('❌ No password set for user:', email);
        console.log('   (This user may have registered via Google)');
        return null;
      }
      
      // 3. Compare passwords
      const isMatch = await bcrypt.compare(pass, user.password);
      
      if (isMatch) {
        console.log('✅ Password match for:', email);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...result } = user;
        return result;
      }
      
      console.log('❌ Password mismatch for:', email);
      return null;
      
    } catch (error) {
      console.error('❌ Error in validateUser:', error);
      return null;
    }
  }

  // ==========================
  // Login (Generate JWT)
  // ==========================
  async login(user: any) {
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role,
      designation: user.designation 
    };
    
    const accessToken = this.jwtService.sign(payload);
    
    console.log('🔑 JWT generated for:', user.email);
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      designation: user.designation,
      image: user.image,
      accessToken: accessToken,
    };
  }

  // ==========================
  // Find or Create Google User
  // ==========================
  async findOrCreateGoogleUser(googleDto: GoogleUserDto) {
    try {
      // Try to find existing user by email
      let user = await this.usersService.findByEmail(googleDto.email);

      if (user) {
        console.log('✅ Existing user found for Google login:', googleDto.email);
        
        // Update user info with latest Google data
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            name: googleDto.name || user.name,
            image: googleDto.image || user.image,
            emailVerified: new Date(),
          },
        });
      } else {
        console.log('📝 Creating new user from Google login:', googleDto.email);
        
        // Create new user from Google data
        user = await this.prisma.user.create({
          data: {
            email: googleDto.email,
            name: googleDto.name,
            image: googleDto.image,
            emailVerified: new Date(),
            // Note: role and designation are null initially
            // Admin must assign these later
          },
        });
        
        console.log('✅ New user created:', user.id);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
      
    } catch (error) {
      console.error('❌ Error in findOrCreateGoogleUser:', error);
      throw error;
    }
  }

  // ==========================
  // Verify JWT Token
  // ==========================
  async verifyToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}