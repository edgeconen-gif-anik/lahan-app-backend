import { getJwtSecret } from './jwt-secret';

describe('getJwtSecret', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalLegacySecret = process.env.JWT_SECRET_KEY;

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    if (originalLegacySecret === undefined) {
      delete process.env.JWT_SECRET_KEY;
    } else {
      process.env.JWT_SECRET_KEY = originalLegacySecret;
    }
  });

  it('returns the configured JWT secret', () => {
    process.env.JWT_SECRET = 'a-long-random-test-secret';
    expect(getJwtSecret()).toBe('a-long-random-test-secret');
  });

  it('fails closed when no secret is configured', () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_SECRET_KEY;
    expect(() => getJwtSecret()).toThrow('JWT_SECRET must be configured');
  });
});
