import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { type ScanRequest, createModalClient } from '@dependency-canary/shared';
import { corsResponse } from '@/lib/cors';
import { db } from '@/db';
import { scanJobs } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as ScanRequest;
    
    if (!body.ref || !body.refType || !body.projectRef) {
      return corsResponse(
        { error: 'Missing required fields: ref, refType, projectRef' },
        400
      );
    }

    const client = createModalClient();
    const result = await client.scan(body);
    await db.insert(scanJobs).values({
      id: result.jobId,
      userId: session.user.id,
      refType: body.refType,
      ref: body.ref,
    });

    return corsResponse(result);
  } catch (error) {
    console.error('Scan API error:', error);
    return corsResponse(
      { error: 'Internal server error' },
      500
    );
  }
}