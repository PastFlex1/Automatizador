import { SocialFallbackStorage, LocalSocialPost } from '../storage/social-fallback.storage';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { hasRealPhoto, isStockImage } from '../../utils/image-utils.ts';
import { dataFile, resolvePublicImage } from '../../config/paths.ts';

const NO_REAL_PHOTOS_ERROR =
  'Ningún producto del catálogo tiene una foto real. Sube al menos una foto de tus equipos en el Catálogo para que el AutoPilot pueda publicar.';

export interface InoxProduct {
  name: string;
  category: string;
  price: string;
  features: string[];
  imageUrl: string;
}

export const APM_INOX_CATALOG: InoxProduct[] = [
  {
    name: 'Cocina Industrial de 2 Quemadores en Acero Inoxidable',
    category: 'Cocinas Industriales',
    price: '$200',
    features: [
      'Fabricada en acero inoxidable de grado alimenticio',
      'Quemadores de hierro fundido de alta potencia',
      'Parrillas reforzadas para ollas grandes',
      'Garantía directa de fábrica',
    ],
    imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Cocina Industrial de 3 Quemadores con Plancha Asadora',
    category: 'Cocinas Industriales',
    price: '$350',
    features: [
      'Acero inoxidable 100% resistente a corrosión',
      'Plancha en acero naval de 6 mm para asar hamburguesas y carnes',
      'Bandeja recolectora de grasa desmontable',
      'Conexión de gas industrial de alta eficiencia',
    ],
    imageUrl: 'https://images.unsplash.com/photo-1588854337221-4cf9fa96059c?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Mesa de Trabajo en Acero Inoxidable con Entrepaño',
    category: 'Mobiliario Gastronómico',
    price: '$160',
    features: [
      'Tablero en acero inoxidable grado 304 sanitario',
      'Refuerzo inferior antivibratorio',
      'Patas tubulares con regatones niveladores',
      'Ideal para panaderías, restaurantes y cafeterías',
    ],
    imageUrl: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Campana Extractora Industrial en Acero Inox con Filtros',
    category: 'Extracción & Ventilación',
    price: '$290',
    features: [
      'Diseño aerodinámico para máxima captación de humo y calor',
      'Filtros laberinto atrapagrasa lavables',
      'Canal perimetral de recolección de condensado',
      'Fabricación a la medida para tu negocio',
    ],
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Cocina Industrial de 4 Quemadores con Horno Incorporado',
    category: 'Cocinas Industriales',
    price: '$580',
    features: [
      'Horno industrial con termocupla de seguridad y aislamiento térmico',
      'Estructura íntegra en acero inoxidable',
      'Perillas de alto impacto para uso rudo',
      'Entrega inmediata y envíos a nivel nacional',
    ],
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=900&q=80',
  },
];

export class AutoPilotService {
  private static getMetaCredentials() {
    const token =
      process.env.META_PAGE_ACCESS_TOKEN || ''; // never hardcode tokens: set it in .env
    const pageId = process.env.META_PAGE_ID || '1323037820891730';
    const pageName = process.env.META_PAGE_NAME || 'APM inox 1';
    return { token, pageId, pageName };
  }

  /**
   * Generate persuasive sales copywriting with AI
   */
  static async generateSalesCopy(product: InoxProduct, angle: string): Promise<string> {
    const systemPrompt = `Eres el Director de Marketing Digital y Ventas de "APM inox 1", fábrica líder de equipos gastronómicos y cocinas en acero inoxidable en Quito, Ecuador.
Tu misión es redactar una publicación de Facebook altamente atractiva que haga que dueños de restaurantes, cafeterías, panaderías y emprendedores de comida quieran comprar ya.
Usa:
- Gancho potente en las primeras 2 líneas con emojis.
- Resalta la durabilidad del acero inoxidable, la garantía de fábrica y el precio accesible (${product.price}).
- Menciona la ubicación: "Quito Norte, frente al Club de Leones".
- Llamada a la acción (CTA) irresistible: "Haz clic en Enviar Mensaje por Messenger o escríbenos para apartar la tuya con entrega inmediata".
- Hashtags estratégicos: #AceroInoxidable #CocinasIndustriales #RestaurantesQuito #EquiposGastronomicos #APMinox
Devuelve SOLO el texto final listo para publicar, sin introducciones ni comillas.`;

    const userPrompt = `Redacta un post para el producto: ${product.name}.
Precio: ${product.price}.
Características: ${product.features.join(', ')}.
Enfoque: ${angle}.`;

    // 1. Try Groq (Ultra fast high-intelligence free models)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && groqKey.startsWith('gsk_')) {
      const groqModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
      for (const model of groqModels) {
        try {
          const groq = new OpenAI({
            apiKey: groqKey,
            baseURL: 'https://api.groq.com/openai/v1',
          });
          const comp = await Promise.race([
            groq.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.7,
            }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Groq timeout')), 6000)),
          ]);
          const out = comp.choices[0]?.message?.content;
          if (out) return out.trim();
        } catch (groqErr: any) {
          console.warn(`[AutoPilot AI] Groq model ${model} error:`, groqErr?.message || groqErr);
        }
      }
    }

    // 2. Try Gemini with modern fast models
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.startsWith('AIzaSy')) {
      const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const model of geminiModels) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const res = await Promise.race([
            ai.models.generateContent({
              model,
              contents: `${systemPrompt}\n\n${userPrompt}`,
            }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 4000)),
          ]);
          if (res && res.text) {
            return res.text.trim();
          }
        } catch (geminiErr) {
          // Try next model
        }
      }
    }

    // 3. Try OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey.startsWith('sk-')) {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const comp = await Promise.race([
          openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
          }),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('OpenAI timeout')), 6000)),
        ]);
        const out = comp.choices[0]?.message?.content;
        if (out) return out.trim();
      } catch (openaiErr) {
        console.warn('[AutoPilot AI] OpenAI generation error, using curated template:', openaiErr);
      }
    }

    // 3. Fallback High-Converting Template
    return `🔥 ¡EQUIPA TU COCINA COMO UN PROFESIONAL CON PRECIO DE FÁBRICA! 🔥\n\n¿Estás abriendo o renovando tu restaurante, cafetería o negocio de comida? En APM inox 1 fabricamos equipos en acero inoxidable de máxima durabilidad y grado alimenticio.\n\n✨ ${product.name.toUpperCase()} ✨\n💰 Precio especial: ${product.price}\n\n✔️ ${product.features.join('\n✔️ ')}\n\n🛡️ Garantía directa de fabricación.\n📍 Visítanos en Quito Norte, al frente del Club de Leones.\n🚚 Envíos y entregas seguras a nivel nacional.\n\n👇 ¡No esperes a que se agoten! Haz clic en ENVIAR MENSAJE por Messenger o cotiza ahora mismo tu equipo a medida. 👇\n\n#AceroInoxidable #CocinasIndustriales #EquiposGastronomicos #RestaurantesEcuador #APMinox`;
  }

  /**
   * Get the active catalog, reading from local-products.json if available
   */
  static getCatalog(): InoxProduct[] {
    const localProductsPath = dataFile('local-products.json');
    if (fs.existsSync(localProductsPath)) {
      try {
        const raw = fs.readFileSync(localProductsPath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) {
          return data.map((p: any) => ({
            name: p.name,
            category: p.category || 'Equipos Gastronómicos',
            price: typeof p.price === 'number' ? `$${p.price}` : (p.price || '$0'),
            features: Array.isArray(p.features) && p.features.length > 0
              ? p.features
              : [p.description || p.tagline || 'Fabricación en acero inoxidable'],
            imageUrl: p.imageUrl || '',
          }));
        }
      } catch (e) {
        console.warn('[AutoPilot] Could not parse local-products.json, using fallback catalog:', e);
      }
    }
    return APM_INOX_CATALOG;
  }

  /**
   * Publish directly to the Facebook Page feed via Meta Graph API
   */
  static async publishToFacebook(caption: string, imageUrl?: string): Promise<{
    success: boolean;
    externalPostId?: string;
    externalPostUrl?: string;
    error?: string;
  }> {
    // Never publish generic stock photos as if they were our equipment.
    if (isStockImage(imageUrl)) {
      return {
        success: false,
        error: 'Publicación bloqueada: la imagen es una foto de stock, no un equipo real. Sube una foto real del producto en el Catálogo.',
      };
    }

    const { token, pageId } = this.getMetaCredentials();

    try {
      let res: globalThis.Response;

      if (imageUrl && imageUrl.startsWith('data:image/')) {
        // 1. Direct Base64 Data URI
        const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const fileBuffer = Buffer.from(matches[2], 'base64');
          const ext = mimeType.split('/')[1] || 'png';

          const formData = new FormData();
          formData.append('source', new Blob([fileBuffer], { type: mimeType }), `upload_${Date.now()}.${ext}`);
          formData.append('caption', caption);
          formData.append('access_token', token);

          res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(30000),
          });
        } else {
          res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: caption, access_token: token }),
            signal: AbortSignal.timeout(15000),
          });
        }
      } else if (imageUrl && imageUrl.startsWith('http')) {
        // 2. Photo Post with remote URL
        res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: imageUrl,
            caption,
            access_token: token,
          }),
          signal: AbortSignal.timeout(20000),
        });
      } else if (imageUrl) {
        // 3. Local image file saved in public/ (e.g. /equipos/xxx.png or equipos/xxx.jpg)
        const cleanPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
        const localFilePath = resolvePublicImage(cleanPath);

        if (fs.existsSync(localFilePath)) {
          const fileBuffer = fs.readFileSync(localFilePath);
          const ext = path.extname(localFilePath).toLowerCase();
          const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

          const formData = new FormData();
          formData.append('source', new Blob([fileBuffer], { type: mimeType }), path.basename(localFilePath));
          formData.append('caption', caption);
          formData.append('access_token', token);

          res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(30000),
          });
        } else {
          // If local file not found, publish feed text post with caption
          res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: caption,
              access_token: token,
            }),
            signal: AbortSignal.timeout(15000),
          });
        }
      } else {
        // 4. Text / Feed Post
        res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: caption,
            access_token: token,
          }),
          signal: AbortSignal.timeout(15000),
        });
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        console.error('[AutoPilot Facebook] Graph API Publish Error:', data);
        return {
          success: false,
          error: data.error?.message || 'Error al publicar en Facebook',
        };
      }

      const externalId = data.post_id || data.id;
      let externalPostUrl = `https://www.facebook.com/${pageId}/posts/${data.id || data.post_id}`;

      // Query real permalink_url from Meta Graph API
      try {
        const permalinkRes = await fetch(
          `https://graph.facebook.com/v21.0/${externalId}?fields=permalink_url&access_token=${token}`,
          { signal: AbortSignal.timeout(4000) }
        );
        const permalinkData = await permalinkRes.json();
        if (permalinkData.permalink_url) {
          externalPostUrl = permalinkData.permalink_url;
        }
      } catch (permalinkErr) {
        // Fallback url remains valid
      }

      return {
        success: true,
        externalPostId: externalId,
        externalPostUrl,
      };
    } catch (err: any) {
      console.error('[AutoPilot Facebook] Network error publishing:', err);
      return {
        success: false,
        error: err.message || 'Error de conexión al publicar en Facebook',
      };
    }
  }

  /**
   * Generate and publish a high-converting post right now
   */
  static async publishNow(productOrIndex?: number | InoxProduct | { id?: string; name: string; price: any; features?: string[]; imageUrl?: string; category?: string }): Promise<{
    success: boolean;
    post?: LocalSocialPost;
    error?: string;
  }> {
    const catalog = this.getCatalog();
    let product: InoxProduct;
    let prodId = 'prod-inox-1';

    if (typeof productOrIndex === 'object' && productOrIndex !== null && 'name' in productOrIndex) {
      product = {
        name: productOrIndex.name,
        category: productOrIndex.category || 'Equipos Gastronómicos',
        price: typeof productOrIndex.price === 'number' ? `$${productOrIndex.price}` : String(productOrIndex.price || '$0'),
        features: Array.isArray(productOrIndex.features) && productOrIndex.features.length > 0
          ? productOrIndex.features
          : ['Fabricación en acero inoxidable'],
        imageUrl: productOrIndex.imageUrl || '',
      };
      prodId = (productOrIndex as any).id || 'prod-inox-custom';
    } else if (typeof productOrIndex === 'number' && productOrIndex >= 0 && productOrIndex < catalog.length) {
      product = catalog[productOrIndex];
      prodId = `prod-inox-${productOrIndex + 1}`;
    } else {
      // Automatic pick: only among products that have a real photo.
      const withPhotos = catalog.map((p, i) => ({ p, i })).filter(({ p }) => hasRealPhoto(p.imageUrl));
      if (withPhotos.length === 0) return { success: false, error: NO_REAL_PHOTOS_ERROR };
      const pick = withPhotos[Math.floor(Math.random() * withPhotos.length)];
      product = pick.p;
      prodId = `prod-inox-${pick.i + 1}`;
    }

    // Check before spending an AI call on the copy.
    if (!hasRealPhoto(product.imageUrl)) {
      return {
        success: false,
        error: `"${product.name}" no tiene una foto real. Súbela en el Catálogo antes de publicarlo.`,
      };
    }

    const caption = await this.generateSalesCopy(product, 'Oferta Directa de Fábrica con Urgencia Comercial');

    // Attempt live publish to Facebook
    const fbResult = await this.publishToFacebook(caption, product.imageUrl);

    const now = new Date().toISOString();
    const newPost = SocialFallbackStorage.addPost({
      workspaceId: 1,
      title: `${product.name} - Publicación Automática`,
      caption,
      contentType: 'IMAGE',
      objective: 'LEAD_GENERATION',
      status: fbResult.success ? 'PUBLISHED' : 'FAILED',
      publishedAt: fbResult.success ? now : null,
      productId: prodId,
      cta: 'Cotizar por Messenger',
      targetPlatforms: ['FACEBOOK'],
      mediaAssets: [
        {
          id: Date.now(),
          url: product.imageUrl,
          mediaType: 'IMAGE',
        },
      ],
      externalPostId: fbResult.externalPostId,
      externalPostUrl: fbResult.externalPostUrl,
      errorMessage: fbResult.error,
    });

    if (fbResult.success) {
      const settings = SocialFallbackStorage.getAutoPilotSettings();
      settings.lastPublishedAt = now;
      settings.totalAutoPublished += 1;
      SocialFallbackStorage.saveAutoPilotSettings(settings);
    }

    return {
      success: fbResult.success,
      post: newPost,
      error: fbResult.error,
    };
  }

  /**
   * Generate and schedule 7 posts for the upcoming week
   */
  static async scheduleWeek(): Promise<{
    success: boolean;
    createdCount: number;
    posts: LocalSocialPost[];
    error?: string;
  }> {
    // Only products with a real photo are scheduled (rotating if there are fewer than 7).
    const catalog = this.getCatalog()
      .map((product, idx) => ({ product, idx }))
      .filter(({ product }) => hasRealPhoto(product.imageUrl));
    if (catalog.length === 0) {
      return { success: false, createdCount: 0, posts: [], error: NO_REAL_PHOTOS_ERROR };
    }

    const created: LocalSocialPost[] = [];
    const angles = [
      'Problema-Agitación-Solución para dueños de restaurantes',
      'Durabilidad y Ahorro a Largo Plazo con Acero Inoxidable',
      'Caso de Éxito y Transformación de Negocio Gastronómico',
      'Oferta Flash de Fin de Semana con Entrega Inmediata',
      'Garantía de Fábrica Directa sin Intermediarios',
      'Equipa tu Cocina Industrial con Facilidad de Pago',
      'Cotización Rápida y Personalizada por Messenger',
    ];

    const baseDate = new Date();
    // Start tomorrow at 10:00 AM
    baseDate.setDate(baseDate.getDate() + 1);
    baseDate.setHours(10, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const { product, idx } = catalog[i % catalog.length];
      const scheduledDate = new Date(baseDate);
      scheduledDate.setDate(scheduledDate.getDate() + i);

      const caption = await this.generateSalesCopy(product, angles[i]);

      const post = SocialFallbackStorage.addPost({
        workspaceId: 1,
        title: `${product.name} (Día ${i + 1})`,
        caption,
        contentType: 'IMAGE',
        objective: 'SALES_CONVERSION',
        status: 'SCHEDULED',
        scheduledAt: scheduledDate.toISOString(),
        productId: `prod-inox-${idx + 1}`,
        cta: 'Escribir por Messenger',
        targetPlatforms: ['FACEBOOK'],
        mediaAssets: [
          {
            id: Date.now() + i,
            url: product.imageUrl,
            mediaType: 'IMAGE',
          },
        ],
      });

      created.push(post);
    }

    return {
      success: true,
      createdCount: created.length,
      posts: created,
    };
  }

  /**
   * Check and publish any scheduled posts that are due right now
   */
  static async processDueScheduledPosts(): Promise<number> {
    const due = SocialFallbackStorage.getDuePosts();
    let published = 0;

    for (const post of due) {
      try {
        const imageUrl = post.mediaAssets?.[0]?.url;
        const result = await this.publishToFacebook(post.caption, imageUrl);

        if (result.success) {
          SocialFallbackStorage.updatePost(post.id, {
            status: 'PUBLISHED',
            publishedAt: new Date().toISOString(),
            externalPostId: result.externalPostId,
            externalPostUrl: result.externalPostUrl,
            errorMessage: null,
          });
          published++;

          const settings = SocialFallbackStorage.getAutoPilotSettings();
          settings.lastPublishedAt = new Date().toISOString();
          settings.totalAutoPublished += 1;
          SocialFallbackStorage.saveAutoPilotSettings(settings);
        } else {
          SocialFallbackStorage.updatePost(post.id, {
            status: 'FAILED',
            errorMessage: result.error,
          });
        }
      } catch (err: any) {
        console.error(`[AutoPilot] Error publishing scheduled post #${post.id}:`, err);
      }
    }

    return published;
  }
}
