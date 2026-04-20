const DEFAULT_IDLE_TIMEOUT_HOURS = 2;
const DEFAULT_ACCESS_TOKEN_MAX_AGE = '6h';
type JwtExpiresIn = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const AUTH_IDLE_TIMEOUT_HOURS = parsePositiveNumber(
  process.env.AUTH_IDLE_TIMEOUT_HOURS,
  DEFAULT_IDLE_TIMEOUT_HOURS,
);

export const AUTH_IDLE_TIMEOUT_MS = AUTH_IDLE_TIMEOUT_HOURS * 60 * 60 * 1000;

export const AUTH_ACCESS_TOKEN_MAX_AGE = (
  process.env.JWT_ACCESS_TOKEN_MAX_AGE || DEFAULT_ACCESS_TOKEN_MAX_AGE
) as JwtExpiresIn;

export function getIdleSessionExpiry(from = new Date()) {
  return new Date(from.getTime() + AUTH_IDLE_TIMEOUT_MS);
}
