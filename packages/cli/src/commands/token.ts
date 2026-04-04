import { SignJWT } from 'jose';

// Default JWT parameters — must match api-gateway and control-api auth plugins
const JWT_ISSUER = 'agent-optima';
const JWT_AUDIENCE = 'agent-optima-api';
const DEFAULT_EXPIRY_SECS = 31_536_000; // 1 year
const MIN_SECRET_LENGTH = 32;

/** Parse a named flag value from argv: --flag <value> */
function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

/** Check whether a boolean flag is present in argv */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function generateToken(args: string[]): Promise<void> {
  const tenant = getFlag(args, '--tenant');
  if (!tenant) {
    console.error('ERROR: --tenant <id> is required');
    process.exit(1);
  }

  const secret = getFlag(args, '--secret') ?? process.env['JWT_SECRET'];
  if (!secret) {
    console.error('ERROR: provide --secret <str> or set the JWT_SECRET environment variable');
    process.exit(1);
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `ERROR: JWT secret must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length})`,
    );
    process.exit(1);
  }

  let expiry: number | null = DEFAULT_EXPIRY_SECS;

  if (hasFlag(args, '--no-expiry')) {
    expiry = null;
  } else {
    const rawExpiry = getFlag(args, '--expiry');
    if (rawExpiry !== undefined) {
      const parsed = Number(rawExpiry);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        console.error('ERROR: --expiry must be a positive integer (seconds)');
        process.exit(1);
      }
      expiry = Math.floor(parsed);
    }
  }

  const key = new TextEncoder().encode(secret);
  let builder = new SignJWT({ tenantId: tenant })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE);

  if (expiry !== null) builder = builder.setExpirationTime(`${expiry}s`);

  const token = await builder.sign(key);
  console.log(token);
}
