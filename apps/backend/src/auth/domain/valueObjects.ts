import { ValidationError, ValueObjectBase } from '@ctv-platform/domain';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** specification/12-Security.md.txt "Password Policy". */
const PASSWORD_MIN_LENGTH = 12;

export class Email extends ValueObjectBase {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): Email {
    const normalized = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new ValidationError('Email must be a valid email address.');
    }
    return new Email(normalized);
  }
}

export class Username extends ValueObjectBase {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): Username {
    const normalized = value.trim();
    if (normalized.length < 3 || normalized.length > 255) {
      throw new ValidationError('Username must be between 3 and 255 characters.');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(normalized)) {
      throw new ValidationError('Username may only contain letters, numbers, "_", "-" and ".".');
    }
    return new Username(normalized);
  }
}

/**
 * Validates plaintext password strength before it ever reaches the hasher.
 * specification/12-Security.md.txt "Password Policy": 12+ characters,
 * uppercase, lowercase, number, special character.
 */
export class PlainTextPassword extends ValueObjectBase {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): PlainTextPassword {
    const issues: string[] = [];
    if (value.length < PASSWORD_MIN_LENGTH) {
      issues.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (!/[A-Z]/.test(value)) {
      issues.push('an uppercase letter');
    }
    if (!/[a-z]/.test(value)) {
      issues.push('a lowercase letter');
    }
    if (!/[0-9]/.test(value)) {
      issues.push('a number');
    }
    if (!/[^A-Za-z0-9]/.test(value)) {
      issues.push('a special character');
    }
    if (issues.length > 0) {
      throw new ValidationError(`Password must contain ${issues.join(', ')}.`);
    }
    return new PlainTextPassword(value);
  }
}
