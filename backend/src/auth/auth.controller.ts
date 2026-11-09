import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, PublicUser } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

export const REFRESH_COOKIE = 'refresh_token';
const AUTH_RATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Create an account and start a session' })
  @Throttle(AUTH_RATE_LIMIT)
  @Post('sign-up')
  async signUp(
    @Body() dto: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.signUp(
      dto,
      this.requestContext(req),
    );
    this.setRefreshCookie(res, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @ApiOperation({ summary: 'Sign in with email and password' })
  @Throttle(AUTH_RATE_LIMIT)
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.signIn(
      dto,
      this.requestContext(req),
    );
    this.setRefreshCookie(res, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @ApiOperation({
    summary:
      'Exchange the refresh cookie for a new session (rotates the token)',
  })
  @Throttle(AUTH_RATE_LIMIT)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    this.assertCsrfSafe(req);
    const session = await this.authService.refresh(
      this.readRefreshCookie(req),
      this.requestContext(req),
    );
    this.setRefreshCookie(res, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @ApiOperation({ summary: 'Revoke the current session' })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    this.assertCsrfSafe(req);
    await this.authService.logout(this.readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @ApiOperation({ summary: 'Protected: get the signed-in user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.getProfile(current.userId);
  }

  // --- helpers -------------------------------------------------------------

  /**
   * Cookie-authenticated endpoints require a custom header. A cross-site form
   * or link cannot set custom headers, and a cross-origin fetch that sets one
   * triggers a CORS preflight — together with SameSite cookies this blocks CSRF.
   */
  private assertCsrfSafe(req: Request): void {
    if (req.header('x-requested-with') !== 'XMLHttpRequest') {
      throw new ForbiddenException('Missing CSRF protection header.');
    }
  }

  private requestContext(req: Request): { userAgent: string; ip: string } {
    return { userAgent: req.header('user-agent') ?? '', ip: req.ip ?? '' };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies: Record<string, string> | undefined = (
      req as unknown as { cookies?: Record<string, string> }
    ).cookies;
    return cookies?.[REFRESH_COOKIE];
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    path: string;
  } {
    const isProduction =
      this.config.getOrThrow<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction || this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: this.config.getOrThrow<'lax' | 'strict' | 'none'>(
        'COOKIE_SAMESITE',
      ),
      path: '/api/auth',
    } as const;
  }

  private setRefreshCookie(res: Response, token: string): void {
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: ttlDays * 24 * 60 * 60_000,
    });
  }
}
