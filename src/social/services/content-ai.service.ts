import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { AIGeneratedContentOption, SocialContentType, SocialObjective } from '../types';

export interface GenerateSocialContentInput {
  productName?: string;
  productDescription?: string;
  productPrice?: string;
  objective: SocialObjective;
  targetAudience?: string;
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'ALL';
  tone?: string;
  keyBenefits?: string[];
  callToAction?: string;
}

export class ContentAIService {
  private static getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  private static getGroqClient(): OpenAI | null {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !apiKey.startsWith('gsk_')) return null;
    return new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  private static getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-') || apiKey.includes('sk-1234a')) return null;
    return new OpenAI({ apiKey });
  }

  /**
   * Generate multiple structured high-converting content variations for social media
   */
  static async generateContent(input: GenerateSocialContentInput): Promise<{
    options: AIGeneratedContentOption[];
    suggestedHashtags: string[];
    strategySummary: string;
  }> {
    const systemPrompt = `Eres el Director de Estrategia de Contenidos y Copywriting para Meta (Instagram, Facebook, Threads) de una plataforma de CRM y Social Selling de alto rendimiento.
Tu misión es generar contenido publicable altamente persuasivo, que capture la atención en los primeros 3 segundos (gancho/hook irresistible), desarrolle el valor y culmine en una llamada a la acción (CTA) comercial clara.

Devuelve SIEMPRE la respuesta en formato JSON estructurado válido con el siguiente schema:
{
  "strategySummary": "Resumen breve de la estrategia de contenido para este objetivo",
  "suggestedHashtags": ["#tag1", "#tag2", "#tag3"],
  "options": [
    {
      "hook": "Gancho inicial impactante en 1 línea",
      "caption": "Copy completo del post con emojis estratégicos, saltos de línea y estructura AIDA o PAS",
      "cta": "Llamada a la acción precisa (ej: 'Escribe INFO por DM', 'Comenta ASESORÍA', 'Clic en el enlace de la bio')",
      "hashtags": ["#tag1", "#tag2"],
      "contentIdea": "Descripción visual de la imagen, carrusel o reel sugerido",
      "recommendedFormat": "IMAGE" // o "CAROUSEL" | "REEL" | "VIDEO" | "TEXT"
    }
  ]
}`;

    const userPrompt = `Genera 3 variantes de contenido para redes sociales con los siguientes parámetros:
- Producto / Servicio: ${input.productName || 'Servicio Premium'}
- Descripción / Oferta: ${input.productDescription || 'Solución comercial especializada'}
- Precio / Condición: ${input.productPrice || 'Consultar propuesta'}
- Objetivo Comercial: ${input.objective}
- Audiencia Objetivo: ${input.targetAudience || 'Compradores calificados y tomadores de decisión'}
- Red Principal: ${input.platform}
- Tono de Marca: ${input.tone || 'Profesional, persuasivo, orientado a conversión'}
- Beneficios Clave: ${input.keyBenefits?.join(', ') || 'Atención personalizada, resultados garantizados'}
- CTA deseado: ${input.callToAction || 'Enviar mensaje directo para agendar'}

Genera 3 opciones con ángulos distintos:
Opción 1: Enfoque Problema-Agitación-Solución (PAS)
Opción 2: Enfoque Autoridad / Caso de Éxito / Transformación
Opción 3: Enfoque Oferta Directa con Urgencia Elegante`;

    // 1. Try Groq (Ultra fast high-intelligence free models)
    const groq = this.getGroqClient();
    if (groq) {
      const groqModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
      for (const model of groqModels) {
        try {
          const response = await groq.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
          });

          const raw = response.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(raw);

          if (parsed && parsed.options) {
            return {
              strategySummary: parsed.strategySummary || `Estrategia orientada a ${input.objective} en ${input.platform}`,
              suggestedHashtags: parsed.suggestedHashtags || ['#Ventas', '#Negocios', '#Crecimiento'],
              options: parsed.options,
            };
          }
        } catch (groqErr) {
          console.warn(`[ContentAI] Groq model ${model} error, trying next:`, groqErr);
        }
      }
    }

    // 2. Try Gemini 2.0 Flash / 1.5 Flash
    const gemini = this.getGeminiClient();
    if (gemini) {
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const model of models) {
        try {
          const response = await gemini.models.generateContent({
            model,
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: {
              responseMimeType: 'application/json',
            },
          });

          if (response && response.text) {
            const cleaned = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed && parsed.options) {
              return {
                strategySummary: parsed.strategySummary || `Estrategia orientada a ${input.objective} en ${input.platform}`,
                suggestedHashtags: parsed.suggestedHashtags || ['#Ventas', '#Negocios', '#Crecimiento'],
                options: parsed.options,
              };
            }
          }
        } catch (geminiErr: any) {
          console.warn(`[ContentAI] Gemini model ${model} failed:`, geminiErr?.message || geminiErr);
        }
      }
    }

    // 3. Try OpenAI if configured
    const openai = this.getOpenAIClient();
    if (openai) {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        });

        const raw = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);

        return {
          strategySummary: parsed.strategySummary || `Estrategia orientada a ${input.objective} en ${input.platform}`,
          suggestedHashtags: parsed.suggestedHashtags || ['#Ventas', '#Negocios', '#Crecimiento'],
          options: parsed.options || this.generateFallbackContent(input).options,
        };
      } catch (error) {
        console.warn('OpenAI error, falling back to rule-based engine:', error);
      }
    }

    // 3. Robust rule-based fallback
    return this.generateFallbackContent(input);
  }

  private static generateFallbackContent(input: GenerateSocialContentInput) {
    const prod = input.productName || 'Nuestra Solución Especializada';
    return {
      strategySummary: `Estrategia de conversión directa para ${prod} enfocada en ${input.objective}.`,
      suggestedHashtags: ['#EstrategiaComercial', '#SocialSelling', '#CrecimientoEmpresarial', '#MetaAds'],
      options: [
        {
          hook: `¿Por qué los mejores negocios eligen ${prod} para escalar? 🚀`,
          caption: `Si estás buscando optimizar resultados sin perder tiempo en procesos manuales, esto te interesa:\n\n✨ Acceso a gestión centralizada\n✨ Respuestas instantáneas y seguimiento continuo\n✨ Mayor tasa de cierre con menos fricción\n\nNo dejes que las oportunidades se queden en un mensaje sin responder.`,
          cta: '👉 Escríbenos por mensaje privado o comenta "QUIERO" para recibir detalles inmediatos.',
          hashtags: ['#Eficiencia', '#CierresDeVenta', '#NegociosInteligentes'],
          contentIdea: 'Carrusel de 3 láminas mostrando el dolor actual vs el resultado después de implementar.',
          recommendedFormat: 'CAROUSEL' as SocialContentType,
        },
        {
          hook: `El 80% de las ventas en redes se pierden por falta de seguimiento rápido. ⏱️`,
          caption: `La diferencia entre un prospecto frío y un cliente cerrado es el tiempo de respuesta y la claridad de la propuesta.\n\nCon ${prod}, aseguras cada conversación desde el primer impacto hasta el acuerdo final.\n\n🛡️ Diseñado para empresas que valoran cada interacción.`,
          cta: '📲 Agenda una demostración confidencial haciendo clic en el enlace del perfil.',
          hashtags: ['#AutomatizacionComercial', '#VentasB2B', '#Productividad'],
          contentIdea: 'Reel de 15 segundos con gancho en pantalla y texto dinámico.',
          recommendedFormat: 'REEL' as SocialContentType,
        },
        {
          hook: `Cupos limitados para la nueva fase de implementación de ${prod} 🔥`,
          caption: `Abrimos asesorías estratégicas para negocios calificados.\n\nIncluye:\n🔹 Diagnóstico completo del embudo de conversión\n🔹 Integración multicanal directa (WhatsApp, Instagram, Facebook)\n🔹 Soporte prioritario para cierres de alto valor`,
          cta: '💬 Envía un mensaje directo con la palabra "ASESORÍA" para apartar tu lugar hoy mismo.',
          hashtags: ['#OportunidadComercial', '#CrecimientoExponencial'],
          contentIdea: 'Imagen de alta calidad minimalista con titular limpio y badge de exclusividad.',
          recommendedFormat: 'IMAGE' as SocialContentType,
        },
      ],
    };
  }
}
