import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RefreshToken } from './schemas/refresh-token.schema';

const CTX = { userAgent: 'jest', ip: '127.0.0.1' };

describe('AuthService', () => {
  let service: AuthService;
  let users: {
    findByEmailWithCredentials: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    recordFailedLogin: jest.Mock;
    resetFailedLogins: jest.Mock;
  };
  let refreshModel: { create: jest.Mock };

  beforeEach(async () => {
    users = {
      findByEmailWithCredentials: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogins: jest.fn(),
    };
    refreshModel = { create: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access.jwt') },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              ({
                REFRESH_TOKEN_TTL_DAYS: 7,
                MAX_FAILED_LOGINS: 5,
                LOCK_MINUTES: 15,
              })[key],
          },
        },
        { provide: getModelToken(RefreshToken.name), useValue: refreshModel },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('hashes the password with Argon2id on sign-up and issues a session', async () => {
    users.findByEmailWithCredentials.mockResolvedValue(null);
    let createdInput: { passwordHash: string } | undefined;
    users.create.mockImplementation((input: { passwordHash: string }) => {
      createdInput = input;
      return Promise.resolve({
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        email: 'ada@example.com',
        name: 'Ada',
        createdAt: new Date(),
        passwordHash: input.passwordHash,
      });
    });

    const session = await service.signUp(
      { email: 'ada@example.com', name: 'Ada', password: 'Str0ng!Pass' },
      CTX,
    );

    expect(session.accessToken).toBe('access.jwt');
    expect(session.refreshToken.length).toBeGreaterThan(32);
    const storedHash = createdInput!.passwordHash;
    expect(storedHash.startsWith('$argon2id$')).toBe(true);
    await expect(argon2.verify(storedHash, 'Str0ng!Pass')).resolves.toBe(true);
    // The database only ever stores a hash of the refresh token.
    const storedToken = (
      refreshModel.create.mock.calls as Array<[{ tokenHash: string }]>
    )[0][0];
    expect(storedToken.tokenHash).not.toBe(session.refreshToken);
    expect(storedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate sign-up', async () => {
    users.findByEmailWithCredentials.mockResolvedValue({
      _id: new Types.ObjectId(),
    });
    await expect(
      service.signUp(
        { email: 'ada@example.com', name: 'Ada', password: 'Str0ng!Pass' },
        CTX,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the same generic error for unknown email and wrong password', async () => {
    users.findByEmailWithCredentials.mockResolvedValue(null);
    const unknownEmail = service.signIn(
      { email: 'ghost@example.com', password: 'whatever1!' },
      CTX,
    );

    const realHash = await argon2.hash('Str0ng!Pass', {
      type: argon2.argon2id,
    });
    users.findByEmailWithCredentials.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
      email: 'ada@example.com',
      passwordHash: realHash,
      lockedUntil: null,
    });
    const wrongPassword = service.signIn(
      { email: 'ada@example.com', password: 'Wrong!234' },
      CTX,
    );

    await expect(unknownEmail).rejects.toMatchObject({
      message: 'Invalid email or password.',
    });
    await expect(wrongPassword).rejects.toMatchObject({
      message: 'Invalid email or password.',
    });
    expect(users.recordFailedLogin).toHaveBeenCalledTimes(1);
  });

  it('signs in with correct credentials and resets the failure counter', async () => {
    const realHash = await argon2.hash('Str0ng!Pass', {
      type: argon2.argon2id,
    });
    users.findByEmailWithCredentials.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
      email: 'ada@example.com',
      name: 'Ada',
      createdAt: new Date(),
      passwordHash: realHash,
      lockedUntil: null,
    });

    const session = await service.signIn(
      { email: 'ada@example.com', password: 'Str0ng!Pass' },
      CTX,
    );
    expect(session.user.email).toBe('ada@example.com');
    expect(users.resetFailedLogins).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
    );
  });

  it('rejects refresh without a token', async () => {
    await expect(service.refresh(undefined, CTX)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
