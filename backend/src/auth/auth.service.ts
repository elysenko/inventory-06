import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtPayload } from './jwt.strategy';

const BCRYPT_ROUNDS = 10;

/** The user shape returned to the client — never includes `passwordHash`. */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: Date;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Creates an account. The very first user in an empty database becomes
   * `ADMIN` (bootstrap owner); every later signup is a stock clerk (`USER`).
   * The count and the insert share one transaction so two concurrent first
   * signups cannot both be promoted.
   */
  async signup(dto: SignupDto): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.count();
        return tx.user.create({
          data: {
            email: dto.email,
            name: dto.name ?? null,
            passwordHash,
            role: existing === 0 ? Role.ADMIN : Role.USER,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException({
          message: 'email already exists',
          field: 'email',
        });
      }
      throw error;
    }

    return this.authResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Compare unconditionally-shaped work either way: a missing account and a
    // wrong password return the same message, never "unknown email".
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authResult(user);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return AuthService.toPublicUser(user);
  }

  private authResult(user: User): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      token: this.jwt.sign(payload),
      user: AuthService.toPublicUser(user),
    };
  }

  static toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
