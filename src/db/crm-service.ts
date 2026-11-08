import { db } from './index.ts';
import * as schema from './schema.ts';
import { eq, desc, asc, isNull } from 'drizzle-orm';
import { WorkspaceService } from '../services/workspace.service.ts';
import { ContactService } from '../services/contact.service.ts';
import { LeadService } from '../services/lead.service.ts';
import { DealService } from '../services/deal.service.ts';
import { ConversationService } from '../services/conversation.service.ts';
import { ActivityService } from '../services/activity.service.ts';
import { seedCrmDatabase } from '../services/seed.service.ts';
import { dataFile } from '../config/paths.ts';

// Legacy bridge that leverages our clean modular Phase 2 services
export async function ensureSeedData() {
  return await WorkspaceService.getCurrentWorkspace(1);
}

// Get full CRM workspace state for Frontend
export async function getFullCrmState() {
  try {
    const workspace = await ensureSeedData();

    // Auto-sync real Meta Messenger conversations if any connected account exists
    try {
      const { MetaMessengerService } = await import('../services/meta-messenger.service.ts');
      await MetaMessengerService.syncConversations(workspace.id);
    } catch (e) {
      console.warn("Meta Messenger auto-sync skipped/failed:", e);
    }

    const [

      dbProducts,
      dbCampaigns,
      dbContacts,
      dbLeads,
      dbDeals,
      dbConversations,
      dbMessages,
      dbActivities,
      dbIdentities,
    ] = await Promise.all([
      db.select().from(schema.products).where(eq(schema.products.workspaceId, workspace.id)),
      db.select().from(schema.campaigns).where(eq(schema.campaigns.workspaceId, workspace.id)),
      db.select().from(schema.contacts).where(eq(schema.contacts.workspaceId, workspace.id)),
      db.select().from(schema.leads).where(eq(schema.leads.workspaceId, workspace.id)),
      db.select().from(schema.deals).where(eq(schema.deals.workspaceId, workspace.id)),
      db.select().from(schema.conversations).where(eq(schema.conversations.workspaceId, workspace.id)),
      db.select().from(schema.messages).where(eq(schema.messages.workspaceId, workspace.id)).orderBy(asc(schema.messages.id)),
      db.select().from(schema.activities).where(eq(schema.activities.workspaceId, workspace.id)).orderBy(desc(schema.activities.id)),
      db.select().from(schema.socialIdentities).where(eq(schema.socialIdentities.workspaceId, workspace.id)),
    ]);

    // Format into unified frontend structures
    const formattedLeads = dbContacts.map((contact) => {
      const contactLead = dbLeads.find((l) => l.contactId === contact.id);
      const contactDeal = dbDeals.find((d) => d.contactId === contact.id);
      const contactConv = dbConversations.find((c) => c.contactId === contact.id);
      const contactIdent = dbIdentities.find((i) => i.contactId === contact.id);
      const convMessages = contactConv
        ? dbMessages.filter((m) => m.conversationId === contactConv.id)
        : [];
      const contactActs = dbActivities.filter((a) => a.contactId === contact.id);

      const initialsAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=1877F2&color=ffffff&bold=true&size=256`;
      const fallbackAvatar = contact.avatarUrl || initialsAvatar;

      return {
        id: `lead-${contact.id}`,
        dbContactId: contact.id,
        dbLeadId: contactLead?.id,
        dbDealId: contactDeal?.id,
        dbConversationId: contactConv?.id,
        name: contact.name,
        email: contact.email || "",
        handleOrPhone: contactIdent?.externalUserId ? `ID: ${contactIdent.externalUserId}` : (contact.phone || contact.email || ""),
        avatar: fallbackAvatar,
        channel: (contactConv?.channel?.toLowerCase() || contactIdent?.platform?.toLowerCase() || "messenger") as any,
        pageName: "APM inox 1",
        socialAccountName: "Página Facebook: APM inox 1",
        externalUserId: contactIdent?.externalUserId,
        status: (contactDeal?.stageKey?.toLowerCase() || contactLead?.status?.toLowerCase() || "new_lead") as any,
        urgency: (contactLead?.temperature?.toLowerCase() || "warm") as any,
        intentScore: contactLead?.score || 70,
        estimatedValue: contactDeal?.value ? parseFloat(contactDeal.value) : 0,
        tags: contact.tags || [],
        notes: contact.notes || "",
        lastMessage: contactConv?.lastMessage || (convMessages.length > 0 ? convMessages[convMessages.length - 1].content : ""),
        lastActivity: contactConv?.lastMessageAt ? new Date(contactConv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Reciente",
        unreadCount: contactConv?.unreadCount || 0,
        sourceCampaign: contactLead?.source || "",
        interestProductId: contactLead?.productId || undefined,
        detectedObjection: contactLead?.detectedObjection || undefined,
        conversationHistory: convMessages.map((m) => {
          const msgDate = m.sentAt || m.createdAt;
          const formattedTime = msgDate ? new Date(msgDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (m.timestampStr || '');
          return {
            id: `msg-${m.id}`,
            sender: m.sender as any,
            content: m.content,
            timestamp: formattedTime,
            createdAt: msgDate ? new Date(msgDate).toISOString() : undefined,
            type: (m.type || "TEXT") as any,
            metaData: m.metaData,
          };
        }),
        activities: contactActs.map((a) => ({
          id: `act-${a.id}`,
          type: a.type as any,
          title: a.title,
          description: a.description || "",
          stageBadge: a.stageBadge || "Actividad",
          manager: a.manager || "Asesor Comercial",
          date: a.date || "Hoy",
        })),
      };
    });

    // Filter to ONLY Facebook, Messenger, and WhatsApp leads for now as requested by user
    const realFacebookLeads = formattedLeads.filter((lead) => {
      // Exclude the Page itself from customer inbox list
      if (lead.name?.trim().toLowerCase() === 'apm inox 1' && lead.email?.includes('1323037820891730')) {
        return false;
      }
      return lead.channel === 'messenger' || lead.channel === 'facebook' || lead.channel === 'whatsapp' || lead.tags?.some((t: string) => t.toLowerCase().includes('messenger') || t.toLowerCase().includes('facebook') || t.toLowerCase().includes('whatsapp'));
    });

    return {
      workspace: {
        businessName: workspace.name,
        niche: workspace.niche || "",
        ownerName: workspace.ownerName || "",
        defaultCurrency: workspace.defaultCurrency,
        advisorTone: workspace.advisorTone,
        valueProposition: workspace.valueProposition || "",
        guaranteePolicy: workspace.guaranteePolicy || "",
        paymentMethods: workspace.paymentMethods || [],
        autoPilotMode: workspace.autoPilotMode,
        autoCloseThreshold: workspace.autoCloseThreshold,
        metaConnections: workspace.metaConnections || {},
      },
      products: dbProducts,
      campaigns: dbCampaigns,
      leads: realFacebookLeads,
    };
  } catch (error) {
    // Suppress expected warning when DB is offline since we fall back to local JSON
    try {
      const { FacebookSyncService } = await import('../services/facebook-sync.service.ts');
      let leads = FacebookSyncService.loadSavedLeads();
      if (leads.length === 0) {
        await FacebookSyncService.syncAllConversations();
        leads = FacebookSyncService.loadSavedLeads();
      }

      let fallbackProducts = [
        {
          id: "prod_cocina_2q",
          name: "Cocina de Dos Quemadores Inox",
          category: "Cocinas Industriales",
          price: 200,
          currency: "USD",
          tagline: "Alta eficiencia para restaurantes y negocios gastronómicos",
          description: "Cocina industrial en acero inoxidable de dos quemadores de alta potencia.",
          features: ["Acero inoxidable de grado alimenticio", "Quemadores de alta potencia", "Bandeja recolectora desmontable"],
          objectionHooks: {},
          checkoutUrl: "",
          imageUrl: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80",
        },
      ];

      try {
        const fs = await import('fs');
        const path = await import('path');
        const prodPath = dataFile('local-products.json');
        if (fs.existsSync(prodPath)) {
          const raw = JSON.parse(fs.readFileSync(prodPath, 'utf-8'));
          if (Array.isArray(raw) && raw.length > 0) {
            fallbackProducts = raw.map((p: any, idx: number) => ({
              id: p.id || `prod_${idx}`,
              name: p.name,
              category: p.category || "Equipos Gastronómicos",
              price: typeof p.price === 'number' ? p.price : (parseFloat(p.price) || 0),
              currency: p.currency || "USD",
              tagline: p.tagline || "",
              description: p.description || "",
              features: Array.isArray(p.features) ? p.features : [],
              objectionHooks: p.objectionHooks || {},
              checkoutUrl: p.checkoutUrl || p.websiteUrl || "",
              imageUrl: p.imageUrl || "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80",
            }));
          }
        }
      } catch (_) {}

      return {
        workspace: {
          businessName: "APM inox 1",
          niche: "Fabricación de Equipos de Acero Inoxidable y Cocinas",
          ownerName: "Apm Inox",
          defaultCurrency: "USD",
          advisorTone: "persuasivo",
          valueProposition: "Equipos industriales en acero inoxidable garantizados, cotización rápida por Messenger.",
          guaranteePolicy: "Garantía de fábrica en acero inoxidable de grado alimenticio.",
          paymentMethods: ["Transferencia Bancaria", "Efectivo", "Depósito"],
          autoPilotMode: false,
          autoCloseThreshold: 80,
          metaConnections: {
            whatsapp: { connected: false },
            instagram: { connected: false },
            messenger: { connected: true, page: "APM inox 1" },
          },
        },
        products: fallbackProducts,
        campaigns: [],
        leads: leads,
      };
    } catch (fallbackErr) {
      console.error("Critical error in fallback state:", fallbackErr);
      throw new Error("Failed to load CRM state", { cause: error });
    }
  }
}

// Add a new message to a conversation
export async function addCrmMessage(
  leadIdStr: string,
  message: { sender: string; content: string; type?: string; metaData?: any; timestamp?: string }
) {
  try {
    const contactId = parseInt(leadIdStr.replace("lead-", ""), 10);

    // If this is a Facebook Messenger or WhatsApp lead with external ID
    const externalId = leadIdStr.replace("lead-", "");
    if (externalId.length > 8) {
      const { FacebookSyncService } = await import('../services/facebook-sync.service.ts');
      const leads = FacebookSyncService.loadSavedLeads();
      const lead = leads.find((l) => l.externalUserId === externalId || l.id === leadIdStr);

      let deliveryStatus: 'sent' | 'delivered' | 'failed' = 'delivered';
      let deliveryError: string | undefined = undefined;

      if (message.sender === 'agent' || message.sender === 'ai_autopilot') {
        if (lead?.channel === 'whatsapp') {
          // Send via WhatsApp Cloud API
          try {
            const { WhatsAppSyncService } = await import('../services/whatsapp-sync.service.ts');
            const waResult = await WhatsAppSyncService.sendMessageToWhatsApp(externalId, message.content);
            if (waResult?.simulated) throw new Error(waResult.warning || 'WhatsApp Cloud API no configurado');
          } catch (waErr: any) {
            console.warn("[WhatsApp Send Warning] Dispatch:", waErr?.message || waErr);
            deliveryStatus = 'failed';
            deliveryError = waErr?.message || 'Error al enviar por WhatsApp';
          }
        } else {
          // Send via Facebook Messenger API
          try {
            await FacebookSyncService.sendMessageToFacebook(externalId, message.content);
          } catch (fbErr: any) {
            console.warn("[Messenger Send Warning] Dispatch to Facebook:", fbErr?.message || fbErr);
            deliveryStatus = 'failed';
            deliveryError = fbErr?.message || 'Error al enviar a Facebook';
          }
        }

        // Save sent message to local lead history
        if (lead) {
          const now = new Date();
          lead.conversationHistory.push({
            id: `msg-${Date.now()}`,
            sender: message.sender as any,
            content: message.content,
            timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: now.toISOString(),
            type: 'text',
          });
          lead.lastMessage = message.content;
          lead.lastActivity = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          FacebookSyncService.saveLeads(leads);
        }
      } else {
        if (lead) {
          const now = new Date();
          lead.conversationHistory.push({
            id: `msg-${Date.now()}`,
            sender: 'customer',
            content: message.content,
            timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: now.toISOString(),
            type: 'text',
          });
          lead.lastMessage = message.content;
          lead.lastActivity = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          FacebookSyncService.saveLeads(leads);
        }
      }
      return {
        id: `msg-${Date.now()}`,
        sender: message.sender,
        content: message.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        deliveryStatus,
        deliveryError,
      };
    }

    if (isNaN(contactId)) throw new Error("Invalid contact ID");

    const convList = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.contactId, contactId))
      .limit(1);

    if (convList.length === 0) throw new Error("Conversation not found for contact");
    const conv = convList[0];

    const savedMsg = await ConversationService.addMessage(conv.workspaceId, conv.id, {
      sender: message.sender,
      content: message.content,
      type: (message.type || "TEXT") as any,
      metaData: message.metaData,
      timestampStr: message.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    // If this is a real Meta Messenger / Instagram conversation and sender is agent, dispatch to Meta Graph API
    if (
      (conv.channel?.toUpperCase() === 'MESSENGER' || conv.channel?.toUpperCase() === 'FACEBOOK') &&
      (message.sender === 'agent' || message.sender === 'ai_autopilot')
    ) {
      try {
        const { MetaMessengerService } = await import('../services/meta-messenger.service.ts');
        await MetaMessengerService.sendMessage(conv.workspaceId, contactId, message.content);
      } catch (metaErr: any) {
        console.warn("Could not dispatch message to Meta Graph API (logged in CRM):", metaErr.message);
      }
    }

    return savedMsg;

  } catch (err) {
    // Fallback directly to FacebookSyncService
    try {
      const psid = leadIdStr.replace("lead-", "");
      const { FacebookSyncService } = await import('../services/facebook-sync.service.ts');
      if (message.sender === 'agent' || message.sender === 'ai_autopilot') {
        await FacebookSyncService.sendMessageToFacebook(psid, message.content).catch(() => {});
      }
      return {
        id: `msg-${Date.now()}`,
        sender: message.sender,
        content: message.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    } catch (fallbackSendErr) {
      console.error("Error in addCrmMessage:", err);
      throw new Error("Failed to add message", { cause: err });
    }
  }
}

// Update Deal Stage
export async function updateDealStage(leadIdStr: string, newStageKey: string) {
  try {
    const contactId = parseInt(leadIdStr.replace("lead-", ""), 10);
    if (isNaN(contactId)) {
      // Local lead ID (not in DB) — silently skip
      return { skipped: true, reason: "local-lead" };
    }

    const dealList = await db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.contactId, contactId))
      .limit(1);

    if (dealList.length === 0) {
      // Lead exists locally but has no deal in DB yet — silently skip
      return { skipped: true, reason: "no-deal-found" };
    }
    const deal = dealList[0];

    const stageUpper = newStageKey.toUpperCase().replace(" ", "_");
    if (stageUpper === "WON" || stageUpper === "WON_CLOSED") {
      return await DealService.markDealWon(deal.workspaceId, deal.id);
    } else {
      return await DealService.updateDeal(deal.workspaceId, deal.id, {
        stageKey: stageUpper,
      });
    }
  } catch (err) {
    console.warn("updateDealStage skipped (non-critical):", (err as any)?.message);
    return { skipped: true, reason: "error", detail: (err as any)?.message };
  }
}

// Create a new Lead & Deal
export async function createNewLeadRecord(newLeadData: {
  name: string;
  phone: string;
  email?: string;
  channel: string;
  productId: string;
  notes?: string;
  estimatedValue?: number;
}) {
  try {
    const workspace = await WorkspaceService.getCurrentWorkspace('demo-business');

    // 1. Create Contact
    const contact = await ContactService.createContact(workspace.id, {
      name: newLeadData.name,
      email: newLeadData.email,
      phone: newLeadData.phone,
      notes: newLeadData.notes,
      tags: ['Nuevo', newLeadData.channel.toUpperCase()],
      socialIdentities: [
        {
          platform: newLeadData.channel.toUpperCase() as any,
          externalUserId: newLeadData.phone,
          username: newLeadData.phone,
        },
      ],
    });

    // 2. Create Lead
    const lead = await LeadService.createLead(workspace.id, {
      contactId: contact.id,
      productId: newLeadData.productId,
      source: 'MANUAL_ENTRY',
      status: 'NEW',
      temperature: 'HOT',
      score: 85,
    });

    // 3. Create Deal
    const deal = await DealService.createDeal(workspace.id, {
      contactId: contact.id,
      leadId: lead.id,
      title: `Negociación con ${contact.name}`,
      value: newLeadData.estimatedValue || 997,
      currency: 'USD',
      stageKey: 'NEW',
      status: 'OPEN',
    });

    // 4. Create Conversation
    const conv = await ConversationService.createConversation(workspace.id, {
      contactId: contact.id,
      channel: newLeadData.channel.toUpperCase() as any,
      status: 'ACTIVE',
    });

    // 5. Initial message
    await ConversationService.addMessage(workspace.id, conv.id, {
      sender: 'customer',
      content: 'Hola, me interesa conocer más sobre la propuesta y precios.',
      type: 'TEXT',
      timestampStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    return { contactId: contact.id, leadId: lead.id, dealId: deal.id };
  } catch (err) {
    // FALLBACK TO JSON FOR WHATSAPP/LOCAL LEADS WHEN POSTGRES IS OFFLINE
    try {
      const { FacebookSyncService } = await import('../services/facebook-sync.service.ts');
      const leads = FacebookSyncService.loadSavedLeads();
      const fakeId = Date.now().toString();
      
      const newLead = {
        id: `lead-${fakeId}`,
        dbContactId: parseInt(fakeId.substring(0, 5)),
        name: newLeadData.name,
        email: newLeadData.email || "",
        handleOrPhone: newLeadData.phone || "",
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newLeadData.name)}&background=1877F2&color=ffffff&bold=true&size=256`,
        channel: newLeadData.channel.toLowerCase() as any,
        pageName: "APM inox 1",
        socialAccountName: newLeadData.channel.toLowerCase() === 'whatsapp' ? "WhatsApp Web" : "Página Local",
        externalUserId: newLeadData.phone,
        status: "new_lead",
        urgency: "hot",
        intentScore: 85,
        estimatedValue: newLeadData.estimatedValue || 997,
        tags: ["WhatsApp Web", "Nuevo"],
        notes: newLeadData.notes || "",
        lastMessage: "Contacto guardado desde la extensión.",
        lastActivity: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unreadCount: 0,
        conversationHistory: [
          {
            id: `msg-${Date.now()}`,
            sender: 'agent',
            content: 'Contacto guardado y enlazado al CRM.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: new Date().toISOString(),
            type: 'text'
          }
        ],
        activities: []
      };
      
      leads.unshift(newLead as any);
      FacebookSyncService.saveLeads(leads);
      return { contactId: newLead.dbContactId, leadId: fakeId, dealId: fakeId };
    } catch (fallbackErr) {
      console.error("Error in fallback createNewLeadRecord:", fallbackErr);
      throw new Error("Failed to create new lead in database", { cause: err });
    }
  }
}

// Update Workspace Profile
export async function updateWorkspaceSettings(profileData: any) {
  try {
    const workspace = await WorkspaceService.getCurrentWorkspace('demo-business');
    return await WorkspaceService.updateWorkspace(workspace.id, profileData);
  } catch (err) {
    console.error("Error in updateWorkspaceSettings:", err);
    throw new Error("Failed to update workspace in database", { cause: err });
  }
}
