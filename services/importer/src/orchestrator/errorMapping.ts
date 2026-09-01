import { ProviderErrorCodeEnum } from '@ctv-platform/sdk';
import { ImportFailureCategoryEnum } from '../enums.js';

/** Translates a single-call `ProviderErrorCodeEnum` into a job-level failure category. */
export function mapProviderErrorCode(code: ProviderErrorCodeEnum): ImportFailureCategoryEnum {
  switch (code) {
    case ProviderErrorCodeEnum.TIMEOUT:
      return ImportFailureCategoryEnum.TIMEOUT;
    case ProviderErrorCodeEnum.RATE_LIMITED:
      return ImportFailureCategoryEnum.RATE_LIMIT;
    case ProviderErrorCodeEnum.UNAUTHORIZED:
      return ImportFailureCategoryEnum.AUTHENTICATION_ERROR;
    case ProviderErrorCodeEnum.FORBIDDEN:
    case ProviderErrorCodeEnum.NOT_FOUND:
    case ProviderErrorCodeEnum.INVALID_RESPONSE:
    case ProviderErrorCodeEnum.NOT_SUPPORTED:
      return ImportFailureCategoryEnum.PROVIDER_ERROR;
    case ProviderErrorCodeEnum.UNKNOWN_ERROR:
    default:
      return ImportFailureCategoryEnum.UNKNOWN_ERROR;
  }
}
