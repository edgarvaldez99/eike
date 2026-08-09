/**
 * Crea el superadmin inicial. Reemplaza api/seed_superadmin.php del PHP
 * original: ahí era un endpoint HTTP protegido por una key en la query
 * string (superficie de ataque innecesaria); acá es un script de línea de
 * comandos que solo corre quien tiene acceso al servidor/contenedor.
 *
 * Igual que el PHP: rechaza correr si ya existe un superadmin en la base.
 *
 * Uso:
 *   pnpm seed:superadmin -- --nombre "Admin Eike" --email admin@eike.com.py --password "unaClaveSegura123"
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { hashearPassword } from "@/lib/auth/password";

function leerArgumento(nombre: string): string | undefined {
  const bandera = `--${nombre}`;
  const indice = process.argv.indexOf(bandera);
  return indice !== -1 ? process.argv[indice + 1] : undefined;
}

async function principal() {
  const nombre = leerArgumento("nombre");
  const email = leerArgumento("email")?.trim().toLowerCase();
  const password = leerArgumento("password");

  if (!nombre || !email || !password) {
    throw new Error(
      'Faltan argumentos. Uso: pnpm seed:superadmin -- --nombre "..." --email "..." --password "..."',
    );
  }
  if (password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const yaExiste = await db.query.usuarios.findFirst({
    where: eq(usuarios.rol, "superadmin"),
  });
  if (yaExiste) {
    throw new Error(
      `Ya existe un superadmin en esta base (id ${yaExiste.id}, ${yaExiste.email}). No se crea otro.`,
    );
  }

  const passwordHash = await hashearPassword(password);
  const [creado] = await db
    .insert(usuarios)
    .values({
      nombre,
      email,
      passwordHash,
      rol: "superadmin",
      estado: "activo",
    })
    .returning({ id: usuarios.id, email: usuarios.email });

  console.log(`Superadmin creado: id ${creado.id}, ${creado.email}`);
}

principal()
  .catch((error) => {
    console.error("Falló la creación del superadmin:", error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
