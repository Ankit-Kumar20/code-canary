import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createModalClient } from '@dependency-canary/shared';
import { corsResponse } from '@/lib/cors';
import { agentService } from '@/lib/agent-service';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { scanJobs } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return corsResponse(
        { error: 'Missing jobId parameter' },
        400
      );
    }

    const [job] = await db
      .select()
      .from(scanJobs)
      .where(and(eq(scanJobs.id, jobId), eq(scanJobs.userId, session.user.id)))
      .limit(1);
    if (!job) {
      return corsResponse({ error: 'Scan job not found' }, 404);
    }

    try {
      const client = createModalClient();
      const sbom = await client.enrich(jobId, job.ref);

      // Store the SBOM and its embeddings for the graph, report, and Q&A routes
      console.log(`Indexing SBOM for agent access: ${sbom.projectId}...`);
      await agentService.indexSBOM(sbom);

      await db
        .update(scanJobs)
        .set({ status: 'completed', projectId: sbom.projectId, updatedAt: sql`now()` })
        .where(eq(scanJobs.id, jobId));
      return corsResponse(sbom);
    } catch (error) {
      await db
        .update(scanJobs)
        .set({ status: 'failed', updatedAt: sql`now()` })
        .where(eq(scanJobs.id, jobId));
      throw error;
    }
  } catch (error) {
    console.error('Enrich API error:', error);
    return corsResponse(
      { error: 'Internal server error' },
      500
    );
  }
}
