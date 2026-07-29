import { EntityBase } from '@ctv-platform/domain';
import { Email, Username } from './valueObjects.js';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

/**
 * Local aggregate for authentication/user-management — `packages/domain`
 * (Milestone 1) never modeled User/Role, so this lives here rather than
 * reopening that completed milestone, following the same pattern as
 * `services/importer`'s local persistence layer in Milestone 4.
 */
export class User extends EntityBase<string> {
  private constructor(
    id: string,
    private _email: Email,
    private _username: Username,
    private _passwordHash: string,
    private _role: UserRole,
    private _isActive: boolean,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {
    super(id);
  }

  static create(props: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    role: UserRole;
  }): User {
    const now = new Date();
    return new User(
      props.id,
      Email.create(props.email),
      Username.create(props.username),
      props.passwordHash,
      props.role,
      true,
      now,
      now,
    );
  }

  /** Rehydrates a User from persisted state without re-running creation invariants. */
  static reconstitute(props: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User(
      props.id,
      Email.create(props.email),
      Username.create(props.username),
      props.passwordHash,
      props.role,
      props.isActive,
      props.createdAt,
      props.updatedAt,
    );
  }

  get email(): Email {
    return this._email;
  }

  get username(): Username {
    return this._username;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get role(): UserRole {
    return this._role;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  changeRole(role: UserRole): void {
    this._role = role;
    this._updatedAt = new Date();
  }

  setActive(isActive: boolean): void {
    this._isActive = isActive;
    this._updatedAt = new Date();
  }
}
