import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { corsResponse } from '@/lib/cors';
import { db } from '@/db';
import { sboms, scanJobs } from '@/db/schema';

export const dynamic = 'force-dynamic';

// Lists the signed-in user's completed scans, or returns one project's SBOM when projectId is given.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (projectId) {
    const [row] = await db
      .select({ sbom: sboms.sbom })
      .from(scanJobs)
      .innerJoin(sboms, eq(scanJobs.projectId, sboms.projectId))
      .where(and(eq(scanJobs.userId, session.user.id), eq(scanJobs.projectId, projectId)))
      .limit(1);
    return row ? corsResponse(row.sbom) : corsResponse({ error: 'Project not found' }, 404);
  }

  const rows = await db
    .selectDistinctOn([scanJobs.projectId], {
      projectId: sboms.projectId,
      ref: scanJobs.ref,
      refType: scanJobs.refType,
      scannedAt: scanJobs.updatedAt,
    })
    .from(scanJobs)
    .innerJoin(sboms, eq(scanJobs.projectId, sboms.projectId))
    .where(and(eq(scanJobs.userId, session.user.id), eq(scanJobs.status, 'completed')))
    .orderBy(scanJobs.projectId, desc(scanJobs.updatedAt));

  rows.sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());
  return corsResponse(rows);
}
