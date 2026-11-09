import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import type { JwtPayload } from './strategies/jwt.strategy';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

interface RequestContext {
  userAgent: string;
  ip: string;
}

const INVALID_CREDENTIALS = 'Invalid email or password.';
// Precomputed Argon2id hash of a random non-credential string. Verifying
// against it for unknown emails keeps sign-in timing uniform, so response
// time cannot be used to enumerate registered accounts.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async signUp(dto: SignUpDto, ctx: RequestContext): Promise<IssuedSession> {
    const existing = await this.usersService.findByEmailWithCredentials(
      dto.email,
    );
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    let user: UserDocument;
    try {
      user = await this.usersService.create({
        email: dto.email,
        name: dto.name,
        passwordHash,
      });
    } catch (error) {
      // Unique-index race between the check above and the insert.
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }

    this.logger.log({ event: 'auth.sign_up', userId: user._id.toString() });
    return this.issueSession(user, randomUUID(), ctx);
  }

  async signIn(dto: SignInDto, ctx: RequestContext): Promise<IssuedSession> {
    const user = await this.usersService.findByEmailWithCredentials(dto.email);

    if (!user) {
      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      this.logger.warn({
        event: 'auth.sign_in_locked',
        userId: user._id.toString(),
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordMatches = await argon2
      .verify(user.passwordHash, dto.password)
      .catch(() => false);
    if (!passwordMatches) {
      await this.usersService.recordFailedLogin(
        user._id.toString(),
        this.config.getOrThrow<number>('MAX_FAILED_LOGINS'),
        this.config.getOrThrow<number>('LOCK_MINUTES'),
      );
      this.logger.warn({
        event: 'auth.sign_in_failed',
        userId: user._id.toString(),
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.usersService.resetFailedLogins(user._id.toString());
    this.logger.log({ event: 'auth.sign_in', userId: user._id.toString() });
    return this.issueSession(user, randomUUID(), ctx);
  }

  async refresh(
    rawToken: string | undefined,
    ctx: RequestContext,
  ): Promise<IssuedSession> {
    if (!rawToken)
      throw new UnauthorizedException('Session expired. Please sign in again.');

    const stored = await this.refreshTokenModel
      .findOne({ tokenHash: this.hashToken(rawToken) })
      .exec();
    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (stored.revokedAt) {
      // An already-rotated token was presented again: treat it as theft and
      // revoke every token in the family, forcing a fresh sign-in everywhere.
      this.logger.warn({
        event: 'auth.refresh_reuse_detected',
        userId: stored.userId.toString(),
        familyId: stored.familyId,
      });
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const user = await this.usersService.findById(stored.userId.toString());
    if (!user)
      throw new UnauthorizedException('Session expired. Please sign in again.');

    const session = await this.issueSession(user, stored.familyId, ctx);
    stored.revokedAt = new Date();
    stored.replacedByTokenHash = this.hashToken(session.refreshToken);
    await stored.save();
    return session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return; // Idempotent: logging out without a session is a no-op.
    await this.refreshTokenModel
      .updateOne(
        { tokenHash: this.hashToken(rawToken), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user)
      throw new UnauthorizedException('Session expired. Please sign in again.');
    return this.toPublicUser(user);
  }

  private async issueSession(
    user: UserDocument,
    familyId: string,
    ctx: RequestContext,
  ): Promise<IssuedSession> {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      typ: 'access',
    };
    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(user._id.toString()),
      tokenHash: this.hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60_000),
      userAgent: ctx.userAgent.slice(0, 512),
      ip: ctx.ip.slice(0, 64),
    });

    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenModel
      .updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: (user as UserDocument & { createdAt: Date }).createdAt,
    };
  }
}
