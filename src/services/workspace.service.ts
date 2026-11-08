import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export class WorkspaceService {
  /**
   * Returns the active workspace for the request.
   * During early development, defaults to the default 'demo-business' workspace.
   * Later this is resolved seamlessly from the user session/JWT token.
   */
  static async getCurrentWorkspace(identifier?: string | number) {
    if (typeof identifier === 'number') {
      const result = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, identifier))
        .limit(1);
      if (result.length > 0) return result[0];
    }

    if (typeof identifier === 'string') {
      const result = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, identifier))
        .limit(1);
      if (result.length > 0) return result[0];
    }

    // Default lookup
    const list = await db.select().from(schema.workspaces).limit(1);
    if (list.length > 0) return list[0];

    // Create default workspace if none exists
    const [created] = await db
      .insert(schema.workspaces)
      .values({
        name: 'Demo Business',
        slug: 'demo-business',
        niche: 'Infoproductos & High Ticket',
        ownerName: 'Admin CRM',
        defaultCurrency: 'USD',
        advisorTone: 'persuasivo',
        valueProposition: 'Cerramos ventas de alto valor en WhatsApp e Instagram con IA',
        guaranteePolicy: '30 días de garantía de satisfacción total',
        paymentMethods: ['Stripe', 'Transferencia', 'PayPal'],
        autoPilotMode: false,
        autoCloseThreshold: 80,
      })
      .returning();

    return created;
  }

  static async getWorkspaceById(id: number) {
    const list = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .limit(1);
    return list[0] || null;
  }

  static async updateWorkspace(id: number, data: Partial<typeof schema.workspaces.$inferInsert>) {
    const [updated] = await db
      .update(schema.workspaces)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(schema.workspaces.id, id))
      .returning();
    return updated;
  }
}
