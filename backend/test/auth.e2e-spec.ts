import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface SessionBody {
  accessToken?: string;
  user?: { email: string };
}

interface ErrorBody {
  message?: string;
}

/**
 * Full HTTP flow against a real MongoDB (see docker-compose.yml).
 * Uses its own database via MONGODB_URI so it never touches dev data.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let server: App;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'Str0ng!Pass';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a weak password on sign-up (400)', async () => {
    await request(server)
      .post('/api/auth/sign-up')
      .send({ email, name: 'E2E User', password: 'weak' })
      .expect(400);
  });

  it('rejects NoSQL-operator payloads (400, never reaches the query)', async () => {
    await request(server)
      .post('/api/auth/sign-in')
      .send({ email: { $gt: '' }, password })
      .expect(400);
  });

  it('signs up, sets an HttpOnly refresh cookie, and serves the protected route', async () => {
    const signUp = await request(server)
      .post('/api/auth/sign-up')
      .send({ email, name: 'E2E User', password })
      .expect(201);

    const cookies = signUp.headers['set-cookie'] as unknown as
      string[] | undefined;
    expect(cookies?.join(';')).toContain('refresh_token=');
    expect(cookies?.join(';').toLowerCase()).toContain('httponly');

    const signUpBody = signUp.body as SessionBody;
    expect(signUpBody.accessToken).toBeTruthy();
    expect(signUp.body).not.toHaveProperty('refreshToken');

    const accessToken = signUpBody.accessToken!;
    await request(server).get('/api/auth/me').expect(401);

    const me = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meBody = me.body as { email?: string };
    expect(meBody.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');

    // Refresh rotates the cookie; presenting the old token again is rejected.
    const firstCookie = (cookies ?? [])[0];
    const refreshed = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .expect(200);
    expect((refreshed.body as SessionBody).accessToken).toBeTruthy();
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .expect(401);
  });

  it('rejects wrong passwords with a generic 401 and signs in with the right one', async () => {
    const wrong = await request(server)
      .post('/api/auth/sign-in')
      .send({ email, password: 'Wrong!234' })
      .expect(401);
    expect((wrong.body as ErrorBody).message).toBe(
      'Invalid email or password.',
    );

    await request(server)
      .post('/api/auth/sign-in')
      .send({ email, password })
      .expect(200);
  });
});
