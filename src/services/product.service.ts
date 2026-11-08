import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, isNull, desc } from 'drizzle-orm';

export interface CreateProductDto {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  currency?: string;
  active?: boolean;
  tagline?: string;
  features?: string[];
  objectionHooks?: Record<string, string>;
  checkoutUrl?: string;
  imageUrl?: string;
}

export type UpdateProductDto = Partial<CreateProductDto>;

export class ProductService {
  static async getProducts(workspaceId: number, options?: { onlyActive?: boolean }) {
    const conditions = [
      eq(schema.products.workspaceId, workspaceId),
      isNull(schema.products.deletedAt),
    ];

    if (options?.onlyActive) {
      conditions.push(eq(schema.products.active, true));
    }

    const productsList = await db
      .select()
      .from(schema.products)
      .where(and(...conditions.filter(Boolean) as any))
      .orderBy(desc(schema.products.createdAt));

    return productsList;
  }

  static async getProductById(workspaceId: number, productId: string) {
    const list = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.workspaceId, workspaceId),
          eq(schema.products.id, productId),
          isNull(schema.products.deletedAt)
        )
      )
      .limit(1);

    return list[0] || null;
  }

  static async createProduct(workspaceId: number, dto: CreateProductDto) {
    const id = dto.id || `prod_${Date.now()}`;
    const formattedPrice = (typeof dto.price === 'number' ? dto.price : parseFloat(dto.price || 0)).toFixed(2);

    const [product] = await db
      .insert(schema.products)
      .values({
        id,
        workspaceId,
        name: dto.name,
        description: dto.description || '',
        category: dto.category || 'General',
        price: formattedPrice,
        currency: (dto.currency || 'USD').toUpperCase(),
        active: dto.active !== undefined ? dto.active : true,
        tagline: dto.tagline || '',
        features: dto.features || [],
        objectionHooks: dto.objectionHooks || {},
        checkoutUrl: dto.checkoutUrl || null,
        imageUrl: dto.imageUrl || null,
      })
      .returning();

    return product;
  }

  static async updateProduct(workspaceId: number, productId: string, dto: UpdateProductDto) {
    const updatePayload: Partial<typeof schema.products.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.description !== undefined) updatePayload.description = dto.description;
    if (dto.category !== undefined) updatePayload.category = dto.category;
    if (dto.price !== undefined) {
      updatePayload.price = (typeof dto.price === 'number' ? dto.price : parseFloat(dto.price || 0)).toFixed(2);
    }
    if (dto.currency !== undefined) updatePayload.currency = dto.currency.toUpperCase();
    if (dto.active !== undefined) updatePayload.active = dto.active;
    if (dto.tagline !== undefined) updatePayload.tagline = dto.tagline;
    if (dto.features !== undefined) updatePayload.features = dto.features;
    if (dto.objectionHooks !== undefined) updatePayload.objectionHooks = dto.objectionHooks;
    if (dto.checkoutUrl !== undefined) updatePayload.checkoutUrl = dto.checkoutUrl;
    if (dto.imageUrl !== undefined) updatePayload.imageUrl = dto.imageUrl;

    const [updated] = await db
      .update(schema.products)
      .set(updatePayload)
      .where(
        and(
          eq(schema.products.workspaceId, workspaceId),
          eq(schema.products.id, productId),
          isNull(schema.products.deletedAt)
        )
      )
      .returning();

    return updated || null;
  }

  static async deleteProduct(workspaceId: number, productId: string) {
    const [deleted] = await db
      .update(schema.products)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.products.workspaceId, workspaceId),
          eq(schema.products.id, productId)
        )
      )
      .returning();

    return deleted || null;
  }
}
