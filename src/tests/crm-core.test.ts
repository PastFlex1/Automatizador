import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { WorkspaceService } from '../services/workspace.service.ts';
import { ContactService } from '../services/contact.service.ts';
import { LeadService } from '../services/lead.service.ts';
import { DealService } from '../services/deal.service.ts';
import { PipelineService } from '../services/pipeline.service.ts';
import { CrmDashboardService } from '../services/crm-dashboard.service.ts';
import { seedCrmDatabase } from '../services/seed.service.ts';

async function runTests() {
  console.log('--- STARTING CRM CORE TEST SUITE (PHASE 2) ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 0. Seed Database
    await seedCrmDatabase();
    const workspaceA = await WorkspaceService.getCurrentWorkspace('demo-business');
    assert(!!workspaceA && workspaceA.id > 0, 'Workspace A exists and is initialized');

    // 1. Crear Contact
    const uniqueEmail = `test.contact.${Date.now()}@example.com`;
    const contact = await ContactService.createContact(workspaceA.id, {
      name: 'Elena Rostova',
      firstName: 'Elena',
      lastName: 'Rostova',
      email: uniqueEmail,
      phone: '+1 305 555 0199',
      company: 'Rostova Global',
      jobTitle: 'VP of Growth',
      tags: ['TestTag', 'VIP'],
      socialIdentities: [
        {
          platform: 'WHATSAPP',
          externalUserId: `wa_${Date.now()}`,
          username: 'elena_rostova',
        },
      ],
    });
    assert(!!contact && contact.id > 0 && contact.email === uniqueEmail, '1. Crear Contact');

    // 2. Crear Lead relacionado con Contact
    const lead = await LeadService.createLead(workspaceA.id, {
      contactId: contact.id,
      source: 'TEST_SUITE',
      status: 'QUALIFIED',
      temperature: 'HOT',
      score: 92,
      productId: 'prod_high_ticket_90d',
    });
    assert(!!lead && lead.contactId === contact.id && lead.temperature === 'HOT', '2. Crear Lead relacionado con Contact');

    // 3. Crear Deal
    const deal = await DealService.createDeal(workspaceA.id, {
      contactId: contact.id,
      leadId: lead.id,
      title: 'Deal Test Elena Rostova',
      value: 1500.00,
      currency: 'USD',
      stageKey: 'NEGOTIATING',
      status: 'OPEN',
    });
    assert(!!deal && deal.id > 0 && parseFloat(deal.value) === 1500 && deal.status === 'OPEN', '3. Crear Deal con valor económico');

    // 4. Cambiar stage de Deal
    const updatedStageDeal = await DealService.updateDeal(workspaceA.id, deal.id, {
      stageKey: 'READY_TO_CLOSE',
    });
    assert(updatedStageDeal?.stageKey === 'READY_TO_CLOSE', '4. Cambiar stage de Deal');

    // 5. Marcar Deal como WON
    const wonDeal = await DealService.markDealWon(workspaceA.id, deal.id);
    assert(wonDeal?.status === 'WON' && wonDeal?.stageKey === 'WON' && !!wonDeal?.wonAt, '5. Marcar Deal como WON');

    // 6. Dashboard calcula pipelineValue y wonDeals
    const metrics = await CrmDashboardService.getDashboardMetrics(workspaceA.id);
    assert(typeof metrics.pipelineValue.amount === 'number' && metrics.pipelineValue.amount >= 0, '6. Dashboard calcula pipelineValue');
    assert(metrics.wonDeals >= 1, '6b. Dashboard registra tratos ganados');

    // 7. Dashboard calcula hotLeads
    assert(metrics.hotLeads >= 1, '7. Dashboard calcula hotLeads dinámicamente');

    // 8. Workspace A no puede consultar datos de Workspace B (Aislamiento Multi-Tenant)
    // Create Workspace B
    const [workspaceB] = await db
      .insert(schema.workspaces)
      .values({
        name: 'Workspace B Isolated',
        slug: `isolated-b-${Date.now()}`,
        niche: 'Real Estate',
        ownerName: 'Owner B',
      })
      .returning();

    const contactsB = await ContactService.getContacts(workspaceB.id);
    const hasContactFromA = contactsB.some((c) => c.id === contact.id);
    assert(!hasContactFromA && contactsB.length === 0, '8. Workspace A no puede consultar datos de Workspace B (Aislamiento Multi-Tenant)');

    // Clean up test data
    await DealService.deleteDeal(workspaceA.id, deal.id);
    await LeadService.deleteLead(workspaceA.id, lead.id);
    await ContactService.deleteContact(workspaceA.id, contact.id);

    console.log(`\n--- TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('Fatal error in tests:', error);
    process.exit(1);
  }
}

runTests();
