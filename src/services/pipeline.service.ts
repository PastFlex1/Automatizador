import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, asc } from 'drizzle-orm';

export class PipelineService {
  static async getPipelines(workspaceId: number) {
    const pipelinesList = await db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.workspaceId, workspaceId));

    if (pipelinesList.length === 0) {
      await this.ensureDefaultPipeline(workspaceId);
      return await db
        .select()
        .from(schema.pipelines)
        .where(eq(schema.pipelines.workspaceId, workspaceId));
    }

    // Attach stages to each pipeline
    const pipelinesWithStages = await Promise.all(
      pipelinesList.map(async (p) => {
        const stages = await db
          .select()
          .from(schema.pipelineStages)
          .where(
            and(
              eq(schema.pipelineStages.workspaceId, workspaceId),
              eq(schema.pipelineStages.pipelineId, p.id)
            )
          )
          .orderBy(asc(schema.pipelineStages.position));
        return { ...p, stages };
      })
    );

    return pipelinesWithStages;
  }

  static async getPipelineById(workspaceId: number, pipelineId: number) {
    const list = await db
      .select()
      .from(schema.pipelines)
      .where(
        and(
          eq(schema.pipelines.workspaceId, workspaceId),
          eq(schema.pipelines.id, pipelineId)
        )
      )
      .limit(1);

    if (list.length === 0) return null;
    const pipeline = list[0];

    const stages = await db
      .select()
      .from(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.workspaceId, workspaceId),
          eq(schema.pipelineStages.pipelineId, pipeline.id)
        )
      )
      .orderBy(asc(schema.pipelineStages.position));

    return { ...pipeline, stages };
  }

  static async getStages(workspaceId: number, pipelineId?: number) {
    const stages = await db
      .select()
      .from(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.workspaceId, workspaceId),
          pipelineId ? eq(schema.pipelineStages.pipelineId, pipelineId) : undefined
        )
      )
      .orderBy(asc(schema.pipelineStages.position));
    return stages;
  }

  static async ensureDefaultPipeline(workspaceId: number) {
    const existing = await db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.workspaceId, workspaceId))
      .limit(1);

    if (existing.length > 0) return existing[0];

    const [pipeline] = await db
      .insert(schema.pipelines)
      .values({
        workspaceId,
        name: 'Sales Pipeline',
        isDefault: true,
      })
      .returning();

    const standardStages = [
      { key: 'NEW', name: '1. Nuevo Lead', position: 1, probability: 10, isWon: false, isLost: false, badgeColor: 'bg-slate-100 text-slate-700', bgHeader: 'bg-slate-50' },
      { key: 'CONTACTED', name: '2. Contactado', position: 2, probability: 25, isWon: false, isLost: false, badgeColor: 'bg-blue-50 text-blue-700', bgHeader: 'bg-blue-50/50' },
      { key: 'QUALIFYING', name: '3. Calificación', position: 3, probability: 40, isWon: false, isLost: false, badgeColor: 'bg-indigo-50 text-indigo-700', bgHeader: 'bg-indigo-50/50' },
      { key: 'QUALIFIED', name: '4. Calificado', position: 4, probability: 55, isWon: false, isLost: false, badgeColor: 'bg-purple-50 text-purple-700', bgHeader: 'bg-purple-50/50' },
      { key: 'ADVISED', name: '5. Asesoría', position: 5, probability: 70, isWon: false, isLost: false, badgeColor: 'bg-sky-50 text-sky-700', bgHeader: 'bg-sky-50/50' },
      { key: 'NEGOTIATING', name: '6. Negociación', position: 6, probability: 80, isWon: false, isLost: false, badgeColor: 'bg-orange-50 text-orange-800', bgHeader: 'bg-orange-50/50' },
      { key: 'READY_TO_CLOSE', name: '7. Por Cerrar', position: 7, probability: 90, isWon: false, isLost: false, badgeColor: 'bg-emerald-50 text-emerald-800', bgHeader: 'bg-emerald-50/50' },
      { key: 'WON', name: '8. Venta Ganada ✨', position: 8, probability: 100, isWon: true, isLost: false, badgeColor: 'bg-emerald-600 text-white font-bold', bgHeader: 'bg-emerald-50' },
      { key: 'LOST', name: '9. Perdido', position: 9, probability: 0, isWon: false, isLost: true, badgeColor: 'bg-red-50 text-red-700', bgHeader: 'bg-red-50/50' },
    ];

    for (const st of standardStages) {
      await db.insert(schema.pipelineStages).values({
        pipelineId: pipeline.id,
        workspaceId,
        name: st.name,
        key: st.key,
        position: st.position,
        probability: st.probability,
        isWon: st.isWon,
        isLost: st.isLost,
        badgeColor: st.badgeColor,
        bgHeader: st.bgHeader,
      });
    }

    return pipeline;
  }
}
