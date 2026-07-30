import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  process.loadEnvFile();
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error('Usage: npm run super-admin:promote -- user@example.com');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, name: true },
    });

    if (!existingUser) {
      console.error(`No user found for ${email}. Create the account first.`);
      process.exit(1);
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { email },
        data: {
          role: Role.SUPER_ADMIN,
          approvalStatus: 'APPROVED',
        },
        select: { id: true, email: true, role: true, name: true },
      });

      await tx.session.deleteMany({ where: { userId: user.id } });
      return user;
    });

    console.log('Super admin role granted successfully:');
    console.log(updatedUser);
    console.log('Existing sessions were revoked; the user must sign in again.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to promote user to super admin:', error);
  process.exit(1);
});
