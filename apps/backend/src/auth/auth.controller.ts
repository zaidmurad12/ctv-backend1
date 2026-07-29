import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../common/decorators/decorators.js';
import type { AuthenticatedUser } from '../common/auth/authenticatedUser.js';
import { AuthResponseDto, LoginDto, RefreshDto, RegisterDto, UserResponseDto } from './dto.js';
import { AuthUseCases } from './useCases.js';

/** specification/12-Security.md.txt "Rate Limiting: Authentication 10 Requests / Minute". */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authUseCases: AuthUseCases) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create a new account' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    const session = await this.authUseCases.register(dto);
    return new AuthResponseDto(session.accessToken, session.refreshToken, session.user);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive an access/refresh token pair' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    const session = await this.authUseCases.login(dto);
    return new AuthResponseDto(session.accessToken, session.refreshToken, session.user);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token for a new token pair' })
  async refresh(@Body() dto: RefreshDto): Promise<AuthResponseDto> {
    const session = await this.authUseCases.refresh(dto.refreshToken);
    return new AuthResponseDto(session.accessToken, session.refreshToken, session.user);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the given refresh token' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.authUseCases.logout(dto.refreshToken);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user’s profile' })
  async profile(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    const fullUser = await this.authUseCases.getProfile(user.userId);
    return new UserResponseDto(fullUser);
  }
}
