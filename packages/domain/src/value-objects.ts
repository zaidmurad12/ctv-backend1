import { ValidationError } from './errors.js';
import { ValueObjectBase } from './base.js';

export class Title extends ValueObjectBase {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): Title {
    const normalized = value.trim();
    if (!normalized) {
      throw new ValidationError('Title must not be empty.');
    }
    if (normalized.length > 500) {
      throw new ValidationError('Title must be 500 characters or fewer.');
    }
    return new Title(normalized);
  }
}

export class Slug extends ValueObjectBase {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): Slug {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
      throw new ValidationError('Slug must be a valid kebab-case value.');
    }
    return new Slug(normalized);
  }
}

export class UrlValue extends ValueObjectBase {
  private constructor(readonly value: string) {
    super();
  }

  static create(value: string): UrlValue {
    const normalized = value.trim();
    if (!normalized) {
      throw new ValidationError('URL must not be empty.');
    }
    if (!/^https?:\/\//i.test(normalized)) {
      throw new ValidationError('URL must be an absolute http(s) URL.');
    }
    return new UrlValue(normalized);
  }
}

export class Rating extends ValueObjectBase {
  private constructor(readonly value: number) {
    super();
  }

  static create(value: number): Rating {
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      throw new ValidationError('Rating must be between 0 and 10.');
    }
    return new Rating(Number(value.toFixed(2)));
  }
}

export class Duration extends ValueObjectBase {
  private constructor(readonly minutes: number) {
    super();
  }

  static create(minutes: number): Duration {
    if (!Number.isInteger(minutes) || minutes < 0) {
      throw new ValidationError('Duration must be a non-negative integer number of minutes.');
    }
    return new Duration(minutes);
  }
}
