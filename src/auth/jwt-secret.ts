export function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;

  if (!secret || secret === 'secretKey') {
    throw new Error(
      'JWT_SECRET must be configured with a long, random production secret',
    );
  }

  return secret;
}
