import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import { User, type UserRole } from '../domain/user.js';
import type { RefreshTokenRepository, StoredRefreshToken, UserRepository } from '../ports.js';

interface UserRow {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: { name: string };
}

function toDomain(row: UserRow): User {
  return User.reconstitute({
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role.name as UserRole,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async save(user: User): Promise<void> {
    const roleId = await this.resolveRoleId(user.role);
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email.value,
        username: user.username.value,
        passwordHash: user.passwordHash,
        roleId,
        isActive: user.isActive,
      },
      update: {
        email: user.email.value,
        username: user.username.value,
        passwordHash: user.passwordHash,
        roleId,
        isActive: user.isActive,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true },
    });
    return row ? toDomain(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { username }, include: { role: true } });
    return row ? toDomain(row) : null;
  }

  async list(params: {
    skip: number;
    take: number;
    search?: string;
  }): Promise<{ items: User[]; total: number }> {
    const where = params.search
      ? {
          OR: [
            { email: { contains: params.search, mode: 'insensitive' as const } },
            { username: { contains: params.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: true },
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toDomain), total };
  }

  /** Roles are not pre-seeded anywhere, so the row is created on first use. */
  private async resolveRoleId(role: UserRole): Promise<string> {
    const row = await this.prisma.role.upsert({
      where: { name: role },
      create: { name: role },
      update: {},
    });
    return row.id;
  }
}

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<string> {
    const row = await this.prisma.refreshToken.create({
      data: { id: randomUUID(), userId, tokenHash, expiresAt },
    });
    return row.id;
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findFirst({ where: { tokenHash } });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
