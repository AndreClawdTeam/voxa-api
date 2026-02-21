import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { type NewUser, type User, users } from '../../db/schema';

export class AuthRepository {
  /**
   * Busca um usuário pelo endereço de email.
   *
   * @param email - Email a buscar
   * @returns Usuário encontrado ou `undefined`
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  /**
   * Busca um usuário pelo UUID.
   *
   * @param id - UUID do usuário
   * @returns Usuário encontrado ou `undefined`
   */
  async findById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  /**
   * Cria um novo usuário no banco de dados.
   *
   * @param data - Dados do usuário a inserir
   * @returns Usuário criado
   */
  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }
}
