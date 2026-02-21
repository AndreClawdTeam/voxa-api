import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  type NewSubscription,
  type NewUser,
  type User,
  subscriptions,
  users,
} from '../../db/schema';

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

  /**
   * Cria uma assinatura para o usuário recém-registrado.
   * Normalmente chamado após `create()` para iniciar o período de trial.
   *
   * @param data - Dados da assinatura a inserir
   * @returns Assinatura criada
   */
  async createSubscription(data: NewSubscription) {
    const [subscription] = await db.insert(subscriptions).values(data).returning();
    return subscription;
  }
}
