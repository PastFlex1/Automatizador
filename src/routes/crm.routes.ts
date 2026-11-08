import { Router, Request, Response } from 'express';
import { WorkspaceService } from '../services/workspace.service.ts';
import { ContactService } from '../services/contact.service.ts';
import { LeadService } from '../services/lead.service.ts';
import { DealService } from '../services/deal.service.ts';
import { PipelineService } from '../services/pipeline.service.ts';
import { ProductService } from '../services/product.service.ts';
import { ConversationService } from '../services/conversation.service.ts';
import { ActivityService } from '../services/activity.service.ts';
import { CrmDashboardService } from '../services/crm-dashboard.service.ts';
import { seedCrmDatabase } from '../services/seed.service.ts';
import {
  createContactSchema,
  updateContactSchema,
  createLeadSchema,
  updateLeadSchema,
  createDealSchema,
  updateDealSchema,
  createProductSchema,
  updateProductSchema,
  createMessageSchema,
} from '../validations/crm.schemas.ts';

export const crmRouter = Router();

// Middleware helper to safely resolve workspace
async function resolveWorkspace(req: Request) {
  // Can be resolved from session/header in the future; currently defaults to current active workspace
  const workspaceHeader = req.headers['x-workspace-id'];
  const workspaceIdParam = workspaceHeader ? parseInt(workspaceHeader as string, 10) : undefined;
  return await WorkspaceService.getCurrentWorkspace(workspaceIdParam);
}

// ==========================================
// 1. WORKSPACE
// ==========================================
crmRouter.get('/workspaces/current', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    res.json({ success: true, data: ws });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.patch('/workspaces/current', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const updated = await WorkspaceService.updateWorkspace(ws.id, req.body);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. CONTACTS
// ==========================================
crmRouter.get('/contacts', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { search, limit, offset } = req.query;
    const contacts = await ContactService.getContacts(ws.id, {
      search: search ? String(search) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
    });
    res.json({ success: true, count: contacts.length, data: contacts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const contactId = parseInt(req.params.id, 10);
    if (isNaN(contactId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const contact = await ContactService.getContactById(ws.id, contactId);
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    res.json({ success: true, data: contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.post('/contacts', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const parseResult = createContactSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const created = await ContactService.createContact(ws.id, parseResult.data as any);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.patch('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const contactId = parseInt(req.params.id, 10);
    if (isNaN(contactId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const parseResult = updateContactSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const updated = await ContactService.updateContact(ws.id, contactId, parseResult.data as any);
    if (!updated) return res.status(404).json({ success: false, error: 'Contact not found' });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const contactId = parseInt(req.params.id, 10);
    if (isNaN(contactId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const deleted = await ContactService.deleteContact(ws.id, contactId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Contact not found' });

    res.json({ success: true, message: 'Contact soft-deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. LEADS
// ==========================================
crmRouter.get('/leads', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { status, temperature, limit, offset } = req.query;
    const leads = await LeadService.getLeads(ws.id, {
      status: status ? String(status) : undefined,
      temperature: temperature ? String(temperature) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
    });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/leads/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const leadId = parseInt(req.params.id, 10);
    if (isNaN(leadId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const lead = await LeadService.getLeadById(ws.id, leadId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    res.json({ success: true, data: lead });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.post('/leads', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const parseResult = createLeadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const created = await LeadService.createLead(ws.id, parseResult.data as any);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.patch('/leads/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const leadId = parseInt(req.params.id, 10);
    if (isNaN(leadId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const parseResult = updateLeadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const updated = await LeadService.updateLead(ws.id, leadId, parseResult.data as any);
    if (!updated) return res.status(404).json({ success: false, error: 'Lead not found' });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.delete('/leads/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const leadId = parseInt(req.params.id, 10);
    if (isNaN(leadId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const deleted = await LeadService.deleteLead(ws.id, leadId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Lead not found' });

    res.json({ success: true, message: 'Lead soft-deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. DEALS / OPPORTUNITIES
// ==========================================
crmRouter.get('/deals', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { status, stageKey, stageId, contactId, limit, offset } = req.query;
    const deals = await DealService.getDeals(ws.id, {
      status: status ? String(status) : undefined,
      stageKey: stageKey ? String(stageKey) : undefined,
      stageId: stageId ? parseInt(String(stageId), 10) : undefined,
      contactId: contactId ? parseInt(String(contactId), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
    });
    res.json({ success: true, count: deals.length, data: deals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/deals/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const dealId = parseInt(req.params.id, 10);
    if (isNaN(dealId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const deal = await DealService.getDealById(ws.id, dealId);
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

    res.json({ success: true, data: deal });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.post('/deals', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const parseResult = createDealSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const created = await DealService.createDeal(ws.id, parseResult.data as any);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.patch('/deals/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const dealId = parseInt(req.params.id, 10);
    if (isNaN(dealId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const parseResult = updateDealSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const updated = await DealService.updateDeal(ws.id, dealId, parseResult.data as any);
    if (!updated) return res.status(404).json({ success: false, error: 'Deal not found' });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.delete('/deals/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const dealId = parseInt(req.params.id, 10);
    if (isNaN(dealId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const deleted = await DealService.deleteDeal(ws.id, dealId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Deal not found' });

    res.json({ success: true, message: 'Deal soft-deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. PIPELINES & STAGES
// ==========================================
crmRouter.get('/pipelines', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const pipelines = await PipelineService.getPipelines(ws.id);
    res.json({ success: true, data: pipelines });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/pipelines/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const pipelineId = parseInt(req.params.id, 10);
    if (isNaN(pipelineId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const pipeline = await PipelineService.getPipelineById(ws.id, pipelineId);
    if (!pipeline) return res.status(404).json({ success: false, error: 'Pipeline not found' });

    res.json({ success: true, data: pipeline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. PRODUCTS
// ==========================================
crmRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const onlyActive = req.query.onlyActive === 'true';
    const products = await ProductService.getProducts(ws.id, { onlyActive });
    res.json({ success: true, count: products.length, data: products });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const product = await ProductService.getProductById(ws.id, req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const parseResult = createProductSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const created = await ProductService.createProduct(ws.id, parseResult.data as any);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.patch('/products/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const parseResult = updateProductSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const updated = await ProductService.updateProduct(ws.id, req.params.id, parseResult.data as any);
    if (!updated) return res.status(404).json({ success: false, error: 'Product not found' });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const deleted = await ProductService.deleteProduct(ws.id, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Product not found' });

    res.json({ success: true, message: 'Product soft-deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 7. CONVERSATIONS & MESSAGES
// ==========================================
crmRouter.get('/inbox', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { channel, status, contactId } = req.query;
    const convs = await ConversationService.getConversations(ws.id, {
      channel: channel ? String(channel) : undefined,
      status: status ? String(status) : undefined,
      contactId: contactId ? parseInt(String(contactId), 10) : undefined,
    });
    res.json({ success: true, count: convs.length, data: convs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/crm/inbox', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { channel, status, contactId } = req.query;
    const convs = await ConversationService.getConversations(ws.id, {
      channel: channel ? String(channel) : undefined,
      status: status ? String(status) : undefined,
      contactId: contactId ? parseInt(String(contactId), 10) : undefined,
    });
    res.json({ success: true, count: convs.length, data: convs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/conversations', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { channel, status, contactId } = req.query;
    const convs = await ConversationService.getConversations(ws.id, {
      channel: channel ? String(channel) : undefined,
      status: status ? String(status) : undefined,
      contactId: contactId ? parseInt(String(contactId), 10) : undefined,
    });
    res.json({ success: true, count: convs.length, data: convs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const conv = await ConversationService.getConversationById(ws.id, convId);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

    res.json({ success: true, data: conv });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const msgs = await ConversationService.getMessagesByConversationId(ws.id, convId);
    res.json({ success: true, count: msgs.length, data: msgs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const parseResult = createMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const message = await ConversationService.addMessage(ws.id, convId, parseResult.data as any);
    res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 8. ACTIVITIES (Audit Log & Timeline)
// ==========================================
crmRouter.get('/activities', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { contactId, dealId, leadId, limit } = req.query;
    const activities = await ActivityService.getActivities(ws.id, {
      contactId: contactId ? parseInt(String(contactId), 10) : undefined,
      dealId: dealId ? parseInt(String(dealId), 10) : undefined,
      leadId: leadId ? parseInt(String(leadId), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });
    res.json({ success: true, count: activities.length, data: activities });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 9. AGGREGATED DASHBOARD METRICS (Step 12)
// ==========================================
crmRouter.get('/crm/dashboard', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const metrics = await CrmDashboardService.getDashboardMetrics(ws.id);
    res.json({ success: true, ...metrics });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 10. INBOX / SIDEBAR PROSPECTS LIST (Step 13)
// ==========================================
crmRouter.get('/crm/inbox', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { channel, temperature, status, search, limit, offset } = req.query;
    const prospects = await CrmDashboardService.getInboxProspects(ws.id, {
      channel: channel ? String(channel) : undefined,
      temperature: temperature ? String(temperature) : undefined,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
    });
    res.json({ success: true, count: prospects.length, data: prospects });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 11. SEED TRIGGER (Dev Endpoint)
// ==========================================
crmRouter.post('/crm/seed', async (_req: Request, res: Response) => {
  try {
    const result = await seedCrmDatabase();
    res.json({ success: true, message: 'CRM database seeded successfully', data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 12. META MESSENGER REAL CONVERSATION SYNC & SEND
// ==========================================
crmRouter.post('/crm/messenger/sync', async (req: Request, res: Response) => {
  try {
    const { FacebookSyncService } = await import('../services/facebook-sync.service.ts');
    const syncRes = await FacebookSyncService.syncAllConversations();
    res.json({
      success: true,
      message: `Sincronización exitosa: ${syncRes.count} conversaciones y ${syncRes.totalMessages} mensajes sincronizados desde APM inox 1.`,
      syncedConversations: syncRes.count,
      syncedMessages: syncRes.totalMessages,
    });
  } catch (error: any) {
    console.error('Error syncing Messenger:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

crmRouter.post('/crm/messenger/send', async (req: Request, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { contactId, text } = req.body;
    if (!contactId || !text) {
      return res.status(400).json({ success: false, error: 'Faltan parámetros: contactId o text' });
    }
    const { MetaMessengerService } = await import('../services/meta-messenger.service.ts');
    const result = await MetaMessengerService.sendMessage(ws.id, parseInt(contactId, 10), text);
    res.json(result);
  } catch (error: any) {
    console.error('Error sending Messenger message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

