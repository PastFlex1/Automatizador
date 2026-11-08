import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { PipelineService } from './pipeline.service.ts';

export async function seedCrmDatabase() {
  if (!process.env.DATABASE_URL && !process.env.SQL_PASSWORD) {
    console.warn("[DB Seed] Variables de PostgreSQL (SQL_PASSWORD o DATABASE_URL) no encontradas en el entorno. Se omite el seed inicial.");
    return null;
  }

  // 1. Ensure Workspace
  let [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, 'demo-business'))
    .limit(1);

  if (!workspace) {
    [workspace] = await db
      .insert(schema.workspaces)
      .values({
        name: 'Demo Business',
        slug: 'demo-business',
        niche: 'Infoproductos & High-Ticket B2B',
        ownerName: 'Admin CRM',
        defaultCurrency: 'USD',
        advisorTone: 'persuasivo',
        valueProposition: 'Escala tus ventas con embudos conversacionales asistidos por IA',
        guaranteePolicy: '30 días de garantía de satisfacción total',
        paymentMethods: ['Stripe', 'Transferencia Bancaria', 'PayPal'],
        autoPilotMode: false,
        autoCloseThreshold: 80,
      })
      .returning();
  }

  // 2. Ensure Internal User
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.uid, 'demo_user_001'))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({
        uid: 'demo_user_001',
        workspaceId: workspace.id,
        email: 'asesor@crmdemobusiness.com',
        name: 'Carlos Mendoza',
        displayName: 'Carlos Mendoza',
        photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        role: 'ADMIN',
      })
      .returning();
  }

  // 3. Ensure Pipeline & Stages
  const pipeline = await PipelineService.ensureDefaultPipeline(workspace.id);
  const stages = await PipelineService.getStages(workspace.id, pipeline.id);
  const stageMap = new Map(stages.map((s) => [s.key, s.id]));

  // 4. Ensure Products
  const seedProducts = [
    {
      id: 'prod_high_ticket_90d',
      name: 'Programa Acelerador High-Ticket 90D',
      description: 'Acompañamiento intensivo 1 a 1 para escalar a $10k-$30k/mes con embudos conversacionales y cierres de alto valor.',
      category: 'High-Ticket Mentorship',
      price: '997.00',
      currency: 'USD',
      active: true,
      tagline: 'Garantía de duplicar ROI en 90 días o mentoría gratis',
      features: [
        '12 Sesiones estratégicas 1 a 1 en vivo',
        'Plantillas probadas de scripts para WhatsApp e Instagram',
        'Agente IA configurado para tu catálogo de ofertas',
        'Soporte prioritario 7 días a la semana',
      ],
      objectionHooks: {
        'precio_alto': 'No es un gasto, es una inversión con retorno garantizado por contrato en 90 días.',
        'sin_tiempo': 'El sistema en piloto automático te ahorra más de 25 horas semanales de atención.',
      },
      checkoutUrl: 'https://buy.stripe.com/demo_high_ticket_90d',
      imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'prod_funnel_workshop',
      name: 'Workshop Embudos de Conversión Meta',
      description: 'Entrenamiento práctico de 3 días para configurar campañas rentables en WhatsApp e Instagram.',
      category: 'Workshops',
      price: '197.00',
      currency: 'USD',
      active: true,
      tagline: 'Aprende a captar prospectos calificados en 72 horas',
      features: ['3 Días de entrenamiento en vivo', 'Acceso de por vida a grabaciones', 'Plantillas de anuncios y creativos'],
      objectionHooks: {},
      checkoutUrl: 'https://buy.stripe.com/demo_workshop',
      imageUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80',
    },
  ];

  for (const p of seedProducts) {
    const existing = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, p.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.products).values({
        id: p.id,
        workspaceId: workspace.id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        currency: p.currency,
        active: p.active,
        tagline: p.tagline,
        features: p.features,
        objectionHooks: p.objectionHooks,
        checkoutUrl: p.checkoutUrl,
        imageUrl: p.imageUrl,
      });
    }
  }

  // 5. Seed 6 Contacts, Leads, Deals & Conversations
  const existingContacts = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.workspaceId, workspace.id))
    .limit(1);

  if (existingContacts.length === 0) {
    const seedContactsData = [
      {
        name: 'Valeria Restrepo',
        firstName: 'Valeria',
        lastName: 'Restrepo',
        email: 'valeria.restrepo@empresa.com',
        phone: '+57 312 984 5512',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
        company: 'Restrepo Consulting & Media',
        jobTitle: 'Directora de Ventas',
        tags: ['High Ticket', 'WhatsApp', 'Urgente'],
        channel: 'WHATSAPP',
        externalUserId: '573129845512',
        lead: {
          source: 'META_ADS',
          sourceCampaign: 'Campaña WhatsApp High-Ticket Mayo',
          status: 'QUALIFIED',
          temperature: 'HOT',
          score: 95,
          productId: 'prod_high_ticket_90d',
          detectedObjection: 'Duda sobre integración técnica',
        },
        deal: {
          title: 'Programa Acelerador 90D - Valeria R.',
          value: '997.00',
          currency: 'USD',
          stageKey: 'READY_TO_CLOSE',
          status: 'OPEN',
          probability: 90,
          expectedCloseDate: '2026-09-18',
        },
        messages: [
          { sender: 'customer', direction: 'INBOUND', content: 'Hola, vi su anuncio del programa acelerador. Quiero saber si incluye garantía por escrito.' },
          { sender: 'agent', direction: 'OUTBOUND', content: '¡Hola Valeria! Sí, totalmente. Incluye garantía contractual de duplicar tu facturación en 90 días o te acompañamos sin costo adicional.' },
          { sender: 'customer', direction: 'INBOUND', content: 'Excelente. ¿Puedo pagar por transferencia o Stripe?' },
        ],
      },
      {
        name: 'Mateo Sandoval',
        firstName: 'Mateo',
        lastName: 'Sandoval',
        email: 'mateo.sandoval@techscale.io',
        phone: '+52 55 4192 8831',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
        company: 'TechScale Academy',
        jobTitle: 'Fundador & CEO',
        tags: ['Instagram DM', 'Decisor', 'Calificado'],
        channel: 'INSTAGRAM',
        externalUserId: 'mateosandoval_official',
        lead: {
          source: 'INSTAGRAM_STORY',
          sourceCampaign: 'Story Ads Conversión',
          status: 'QUALIFIED',
          temperature: 'HOT',
          score: 88,
          productId: 'prod_high_ticket_90d',
          detectedObjection: 'Comparación con otra agencia',
        },
        deal: {
          title: 'Acelerador 90D TechScale - Mateo',
          value: '997.00',
          currency: 'USD',
          stageKey: 'NEGOTIATING',
          status: 'OPEN',
          probability: 80,
          expectedCloseDate: '2026-09-20',
        },
        messages: [
          { sender: 'customer', direction: 'INBOUND', content: 'Buenas tardes, me interesa el programa de 90 días para mi equipo de 3 closers.' },
          { sender: 'agent', direction: 'OUTBOUND', content: 'Hola Mateo, con gusto podemos agendar la llamada de diagnóstico estratégico.' },
        ],
      },
      {
        name: 'Camila Morales',
        firstName: 'Camila',
        lastName: 'Morales',
        email: 'camila.morales@agenciainnovar.cl',
        phone: '+56 9 8472 1093',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        company: 'Agencia Innovar Chile',
        jobTitle: 'Gerente Comercial',
        tags: ['Messenger', 'Venta Cerrada'],
        channel: 'MESSENGER',
        externalUserId: 'camila_morales_fb',
        lead: {
          source: 'ORGANIC_POST',
          status: 'CONVERTED',
          temperature: 'HOT',
          score: 100,
          productId: 'prod_high_ticket_90d',
        },
        deal: {
          title: 'Acelerador High-Ticket 90D - Camila M.',
          value: '997.00',
          currency: 'USD',
          stageKey: 'WON',
          status: 'WON',
          probability: 100,
          expectedCloseDate: '2026-09-12',
        },
        messages: [
          { sender: 'customer', direction: 'INBOUND', content: '¡Pago realizado con éxito! Ya tengo el comprobante de Stripe.' },
          { sender: 'agent', direction: 'OUTBOUND', content: '¡Felicitaciones Camila! Pago verificado. Bienvenida al Programa Acelerador High-Ticket 90D ✨.' },
        ],
      },
      {
        name: 'Santiago Benítez',
        firstName: 'Santiago',
        lastName: 'Benítez',
        email: 'santiago.benitez@growthlatam.co',
        phone: '+57 300 781 2940',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        company: 'Growth Latam Partners',
        jobTitle: 'Growth Lead',
        tags: ['WhatsApp', 'Evaluación'],
        channel: 'WHATSAPP',
        externalUserId: '573007812940',
        lead: {
          source: 'META_ADS',
          status: 'QUALIFYING',
          temperature: 'WARM',
          score: 65,
          productId: 'prod_high_ticket_90d',
          detectedObjection: 'Requiere aprobación de socios',
        },
        deal: {
          title: 'Programa Acelerador - Santiago B.',
          value: '997.00',
          currency: 'USD',
          stageKey: 'ADVISED',
          status: 'OPEN',
          probability: 70,
          expectedCloseDate: '2026-09-25',
        },
        messages: [
          { sender: 'customer', direction: 'INBOUND', content: 'Hola Carlos, le presenté la propuesta a mi socio y nos gustó mucho.' },
          { sender: 'agent', direction: 'OUTBOUND', content: 'Excelente Santiago. ¿Tienen alguna duda adicional antes de formalizar el ingreso?' },
        ],
      },
      {
        name: 'Daniela Cáceres',
        firstName: 'Daniela',
        lastName: 'Cáceres',
        email: 'daniela.caceres@studiobranding.pe',
        phone: '+51 981 234 567',
        avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
        company: 'Studio Branding Perú',
        jobTitle: 'Directora Creativa',
        tags: ['Threads', 'Warm'],
        channel: 'THREADS',
        externalUserId: 'danielacaceres_art',
        lead: {
          source: 'THREADS_POST',
          status: 'CONTACTED',
          temperature: 'WARM',
          score: 55,
          productId: 'prod_funnel_workshop',
        },
        deal: {
          title: 'Workshop Embudos Meta - Daniela C.',
          value: '197.00',
          currency: 'USD',
          stageKey: 'CONTACTED',
          status: 'OPEN',
          probability: 25,
          expectedCloseDate: '2026-09-30',
        },
        messages: [
          { sender: 'customer', direction: 'INBOUND', content: 'Hola, vi tu post en Threads sobre cómo conseguir clientes B2B. ¿El workshop es en vivo?' },
          { sender: 'agent', direction: 'OUTBOUND', content: 'Hola Daniela, sí, 100% en vivo con sesiones prácticas de implementación.' },
        ],
      },
      {
        name: 'Rodrigo Albarracín',
        firstName: 'Rodrigo',
        lastName: 'Albarracín',
        email: 'rodrigo.albarracin@ecommerceplus.ar',
        phone: '+54 9 11 3948 2011',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
        company: 'E-commerce Plus Argentina',
        jobTitle: 'Operations Manager',
        tags: ['Lead Frío', 'Facebook'],
        channel: 'FACEBOOK',
        externalUserId: 'rodrigo_albarracin_fb',
        lead: {
          source: 'FACEBOOK_GROUP',
          status: 'NEW',
          temperature: 'COLD',
          score: 30,
        },
        deal: null,
        messages: [
          { sender: 'customer', direction: 'INBOUND', content: 'Hola, solo pedía más información general sobre los servicios.' },
        ],
      },
    ];

    for (const sc of seedContactsData) {
      // 1. Insert Contact
      const [contact] = await db
        .insert(schema.contacts)
        .values({
          workspaceId: workspace.id,
          name: sc.name,
          firstName: sc.firstName,
          lastName: sc.lastName,
          email: sc.email,
          phone: sc.phone,
          avatarUrl: sc.avatarUrl,
          company: sc.company,
          jobTitle: sc.jobTitle,
          tags: sc.tags,
          language: 'es',
          timezone: 'America/New_York',
        })
        .returning();

      // 2. Insert Social Identity
      await db.insert(schema.socialIdentities).values({
        workspaceId: workspace.id,
        contactId: contact.id,
        platform: sc.channel,
        externalUserId: sc.externalUserId,
        username: sc.externalUserId,
      });

      // 3. Insert Lead
      const [lead] = await db
        .insert(schema.leads)
        .values({
          workspaceId: workspace.id,
          contactId: contact.id,
          source: sc.lead.source,
          sourceCampaign: sc.lead.sourceCampaign || null,
          status: sc.lead.status,
          temperature: sc.lead.temperature,
          score: sc.lead.score,
          productId: sc.lead.productId || null,
          detectedObjection: sc.lead.detectedObjection || null,
        })
        .returning();

      // 4. Insert Deal if any
      let dealRecord = null;
      if (sc.deal) {
        const stageId = stageMap.get(sc.deal.stageKey) || stages[0]?.id;
        [dealRecord] = await db
          .insert(schema.deals)
          .values({
            workspaceId: workspace.id,
            contactId: contact.id,
            leadId: lead.id,
            pipelineId: pipeline.id,
            stageId: stageId,
            stageKey: sc.deal.stageKey,
            productId: sc.lead.productId || null,
            title: sc.deal.title,
            value: sc.deal.value,
            currency: sc.deal.currency,
            probability: sc.deal.probability,
            expectedCloseDate: sc.deal.expectedCloseDate,
            status: sc.deal.status as any,
            assignedUserId: user.id,
            wonAt: sc.deal.status === 'WON' ? new Date() : null,
          })
          .returning();
      }

      // 5. Insert Conversation & Messages
      const [conv] = await db
        .insert(schema.conversations)
        .values({
          workspaceId: workspace.id,
          contactId: contact.id,
          channel: sc.channel,
          status: 'OPEN',
          lastMessage: sc.messages[sc.messages.length - 1]?.content || 'Mensaje inicial',
          lastMessageAt: new Date(),
          unreadCount: 0,
        })
        .returning();

      for (const msg of sc.messages) {
        await db.insert(schema.messages).values({
          workspaceId: workspace.id,
          conversationId: conv.id,
          sender: msg.sender,
          direction: msg.direction as any,
          content: msg.content,
          type: 'TEXT',
          timestampStr: '10:30',
        });
      }

      // 6. Insert Activity
      await db.insert(schema.activities).values({
        workspaceId: workspace.id,
        contactId: contact.id,
        leadId: lead.id,
        dealId: dealRecord?.id || null,
        conversationId: conv.id,
        type: dealRecord?.status === 'WON' ? 'DEAL_WON' : 'CONTACT_CREATED',
        title: dealRecord?.status === 'WON' ? `Venta Ganada: ${dealRecord.title}` : `Contacto registrado: ${contact.name}`,
        description: `Canal: ${sc.channel} | Interés: ${sc.lead.productId || 'General'}`,
        stageBadge: dealRecord?.stageKey || 'Nuevo Lead',
        manager: user.name || 'Asesor CRM',
        date: new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
      });
    }
  }

  // 7. Seed Social Accounts if not existing
  const existingAccounts = await db
    .select()
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.workspaceId, workspace.id))
    .limit(1);

  if (existingAccounts.length === 0) {
    const [igAcc] = await db
      .insert(schema.socialAccounts)
      .values({
        workspaceId: workspace.id,
        platform: 'INSTAGRAM',
        externalAccountId: 'ig_demo_8829',
        name: 'Instagram Negocios Oficial',
        username: 'metacloser.ai',
        profilePictureUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80',
        accessTokenEncrypted: 'demo_enc_token_ig',
        status: 'CONNECTED',
      })
      .returning();

    const [fbAcc] = await db
      .insert(schema.socialAccounts)
      .values({
        workspaceId: workspace.id,
        platform: 'FACEBOOK',
        externalAccountId: 'fb_page_1029',
        name: 'MetaCloser Soluciones B2B',
        username: 'metacloser_b2b',
        profilePictureUrl: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=150&q=80',
        accessTokenEncrypted: 'demo_enc_token_fb',
        status: 'CONNECTED',
      })
      .returning();

    const [thAcc] = await db
      .insert(schema.socialAccounts)
      .values({
        workspaceId: workspace.id,
        platform: 'THREADS',
        externalAccountId: 'th_demo_7712',
        name: 'MetaCloser en Threads',
        username: 'metacloser.ai',
        profilePictureUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80',
        accessTokenEncrypted: 'demo_enc_token_th',
        status: 'CONNECTED',
      })
      .returning();

    // Seed Sample Social Posts
    const [post1] = await db
      .insert(schema.socialPosts)
      .values({
        workspaceId: workspace.id,
        createdById: user.id,
        productId: 'prod_high_ticket_90d',
        title: '3 Errores Fatales al Cerrar Clientes por WhatsApp',
        caption: '¿Tus prospectos te dejan en "visto" cuando envías el precio?\n\nAquí tienes la estructura exacta de 3 pasos que usamos para transformar dudas en pagos confirmados sin sonar insistente:\n\n1. Diagnóstico previo con preguntas de dolor.\n2. Presentación fiduciaria de la solución.\n3. Enlace directo de custodia o garantía.\n\nComenta "CIERRE" para enviarte la plantilla completa por DM.',
        contentType: 'IMAGE',
        objective: 'LEADS',
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      })
      .returning();

    // Media & Targets for post1
    await db.insert(schema.socialMediaAssets).values({
      workspaceId: workspace.id,
      socialPostId: post1.id,
      type: 'IMAGE',
      url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
      position: 0,
    });

    const [target1] = await db
      .insert(schema.socialPostTargets)
      .values({
        workspaceId: workspace.id,
        socialPostId: post1.id,
        socialAccountId: igAcc.id,
        platform: 'INSTAGRAM',
        status: 'PUBLISHED',
        externalPostId: 'ig_post_1001',
        externalPostUrl: 'https://instagram.com/p/demo1001',
        publishedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      })
      .returning();

    await db.insert(schema.socialPostAnalytics).values({
      workspaceId: workspace.id,
      socialPostId: post1.id,
      socialPostTargetId: target1.id,
      impressions: 4820,
      reach: 3950,
      likes: 312,
      comments: 68,
      shares: 45,
      clicks: 129,
    });

    // Seed Scheduled Post
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    futureDate.setHours(18, 0, 0, 0);

    const [post2] = await db
      .insert(schema.socialPosts)
      .values({
        workspaceId: workspace.id,
        createdById: user.id,
        productId: 'prod_funnel_workshop',
        title: 'Masterclass: Automatización de Embudos Meta con IA',
        caption: 'Revelamos el paso a paso para sincronizar anuncios en Instagram con respuestas inteligentes en WhatsApp que aumentan el ratio de conversión en un 40%.\n\nCupos limitados para la sesión en vivo.\n\nToca el enlace de nuestra biografía para apartar tu lugar con tarifa preferencial.',
        contentType: 'IMAGE',
        objective: 'SALES',
        status: 'SCHEDULED',
        scheduledAt: futureDate,
      })
      .returning();

    await db.insert(schema.socialMediaAssets).values({
      workspaceId: workspace.id,
      socialPostId: post2.id,
      type: 'IMAGE',
      url: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80',
      position: 0,
    });

    await db.insert(schema.socialPostTargets).values({
      workspaceId: workspace.id,
      socialPostId: post2.id,
      socialAccountId: fbAcc.id,
      platform: 'FACEBOOK',
      status: 'SCHEDULED',
    });
  }

  return { workspace, pipeline };
}
