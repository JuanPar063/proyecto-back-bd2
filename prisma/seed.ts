import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seed inicial — crea un ADMIN por defecto para que Sofia y los demás
 * puedan probar el flujo de auth desde el día 1.
 *
 * Ejecutar:
 *   npm run prisma:seed
 */
const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@sqljudge.local';
  const exists = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (exists) {
    console.log(`[seed] Admin ya existe: ${adminEmail}`);
    return;
  }

  const passwordHash = await bcrypt.hash('Admin123!', 10);

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      fullName: 'Administrador',
      role: Role.ADMIN,
    },
  });

  console.log(`[seed] Admin creado: ${adminEmail} / Admin123!`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
