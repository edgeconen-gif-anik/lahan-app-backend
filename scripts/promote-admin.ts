import { PrismaClient, Role } from '@prisma/client';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error('Usage: npm run admin:promote -- user@example.com');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, name: true },
    });

    if (!existingUser) {
      console.error(`No user found for ${email}. Create the account first.`);
      process.exit(1);
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role: Role.ADMIN },
      select: { id: true, email: true, role: true, name: true },
    });

    console.log('Admin role granted successfully:');
    console.log(updatedUser);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to promote user to admin:', error);
  process.exit(1);
});
