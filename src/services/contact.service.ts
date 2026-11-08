import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, isNull, or, ilike, desc } from 'drizzle-orm';
import { ActivityService } from './activity.service.ts';

export interface CreateContactDto {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  company?: string;
  jobTitle?: string;
  language?: string;
  timezone?: string;
  address?: string;
  tags?: string[];
  notes?: string;
  socialIdentities?: Array<{
    platform: string; // 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'FACEBOOK' | 'THREADS'
    externalUserId: string;
    username?: string;
    metadata?: any;
  }>;
}

export type UpdateContactDto = Partial<CreateContactDto>;

export class ContactService {
  static async getContacts(
    workspaceId: number,
    options?: { search?: string; limit?: number; offset?: number; includeDeleted?: boolean }
  ) {
    const conditions = [
      eq(schema.contacts.workspaceId, workspaceId),
      options?.includeDeleted ? undefined : isNull(schema.contacts.deletedAt),
    ];

    if (options?.search) {
      const s = `%${options.search}%`;
      conditions.push(
        or(
          ilike(schema.contacts.name, s),
          ilike(schema.contacts.email, s),
          ilike(schema.contacts.phone, s),
          ilike(schema.contacts.company, s)
        )
      );
    }

    const contactsList = await db
      .select()
      .from(schema.contacts)
      .where(and(...conditions.filter(Boolean) as any))
      .orderBy(desc(schema.contacts.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    return contactsList;
  }

  static async getContactById(workspaceId: number, contactId: number) {
    const list = await db
      .select()
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          eq(schema.contacts.id, contactId),
          isNull(schema.contacts.deletedAt)
        )
      )
      .limit(1);

    if (list.length === 0) return null;
    const contact = list[0];

    // Fetch associated social identities
    const identities = await db
      .select()
      .from(schema.socialIdentities)
      .where(
        and(
          eq(schema.socialIdentities.workspaceId, workspaceId),
          eq(schema.socialIdentities.contactId, contactId)
        )
      );

    return {
      ...contact,
      socialIdentities: identities,
    };
  }

  static async createContact(workspaceId: number, dto: CreateContactDto) {
    const name = dto.name || [dto.firstName, dto.lastName].filter(Boolean).join(' ') || 'Contacto';
    
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        workspaceId,
        name,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email || null,
        phone: dto.phone || null,
        avatarUrl:
          dto.avatarUrl ||
          `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80`,
        company: dto.company || null,
        jobTitle: dto.jobTitle || null,
        language: dto.language || 'es',
        timezone: dto.timezone || 'America/New_York',
        address: dto.address || null,
        tags: dto.tags || [],
        notes: dto.notes || null,
      })
      .returning();

    // Insert social identities if provided
    if (dto.socialIdentities && dto.socialIdentities.length > 0) {
      for (const ident of dto.socialIdentities) {
        await db.insert(schema.socialIdentities).values({
          workspaceId,
          contactId: contact.id,
          platform: ident.platform.toUpperCase(),
          externalUserId: ident.externalUserId,
          username: ident.username || ident.externalUserId,
          metadata: ident.metadata || {},
        });
      }
    }

    // Log Activity
    await ActivityService.logActivity(workspaceId, {
      contactId: contact.id,
      type: 'CONTACT_CREATED',
      title: `Contacto creado: ${contact.name}`,
      description: `Se registró el contacto con teléfono/email: ${contact.phone || contact.email || 'N/A'}`,
      stageBadge: 'Nuevo Contacto',
    });

    return contact;
  }

  static async updateContact(workspaceId: number, contactId: number, dto: UpdateContactDto) {
    const updatePayload: Partial<typeof schema.contacts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.firstName !== undefined) updatePayload.firstName = dto.firstName;
    if (dto.lastName !== undefined) updatePayload.lastName = dto.lastName;
    if (dto.email !== undefined) updatePayload.email = dto.email;
    if (dto.phone !== undefined) updatePayload.phone = dto.phone;
    if (dto.avatarUrl !== undefined) updatePayload.avatarUrl = dto.avatarUrl;
    if (dto.company !== undefined) updatePayload.company = dto.company;
    if (dto.jobTitle !== undefined) updatePayload.jobTitle = dto.jobTitle;
    if (dto.language !== undefined) updatePayload.language = dto.language;
    if (dto.timezone !== undefined) updatePayload.timezone = dto.timezone;
    if (dto.address !== undefined) updatePayload.address = dto.address;
    if (dto.tags !== undefined) updatePayload.tags = dto.tags;
    if (dto.notes !== undefined) updatePayload.notes = dto.notes;

    const [updated] = await db
      .update(schema.contacts)
      .set(updatePayload)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          eq(schema.contacts.id, contactId),
          isNull(schema.contacts.deletedAt)
        )
      )
      .returning();

    return updated || null;
  }

  static async deleteContact(workspaceId: number, contactId: number) {
    // Soft delete
    const [deleted] = await db
      .update(schema.contacts)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          eq(schema.contacts.id, contactId)
        )
      )
      .returning();

    return deleted || null;
  }
}
