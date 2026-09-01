import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { NotFoundError } from '@ctv-platform/domain';
import { User } from '../auth/domain/user.js';
import { PlainTextPassword, Username } from '../auth/domain/valueObjects.js';
import {
  PASSWORD_HASHER,
  USER_REPOSITORY,
  type PasswordHasher,
  type UserRepository,
} from '../auth/ports.js';

/** `User` exposes no setters for email/username/passwordHash; rebuilding via `reconstitute()` applies a change immutably. */
function withChanges(user: User, overrides: { username?: string; passwordHash?: string }): User {
  return User.reconstitute({
    id: user.id,
    email: user.email.value,
    username: overrides.username ?? user.username.value,
    passwordHash: overrides.passwordHash ?? user.passwordHash,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: new Date(),
  });
}

@Injectable()
export class UsersUseCases {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async getById(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  async updateProfile(userId: string, input: { username?: string }): Promise<User> {
    const user = await this.getById(userId);
    if (input.username === undefined) {
      return user;
    }

    Username.create(input.username);
    const clash = await this.users.findByUsername(input.username);
    if (clash && clash.id !== user.id) {
      throw new UnauthorizedException('This username is already taken.');
    }

    const updated = withChanges(user, { username: input.username });
    await this.users.save(updated);
    return updated;
  }

  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const user = await this.getById(userId);
    if (!(await this.hasher.verify(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    PlainTextPassword.create(input.newPassword);
    const newHash = await this.hasher.hash(input.newPassword);
    await this.users.save(withChanges(user, { passwordHash: newHash }));
  }
}
