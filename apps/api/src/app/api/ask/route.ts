import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import type { AskRequest } from '@dependency-canary/shared';
import { corsResponse } from '@/lib/cors';
import { agentService } from '@/lib/agent-service';

export async function POST(request: NextRequest) {
  try {
    if (!(await auth.api.getSession({ headers: request.headers }))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as AskRequest;
    
    if (!body.projectId || !body.question) {
      return corsResponse(
        { error: 'Missing required fields: projectId, question' },
        400
      );
    }

    const answer = await agentService.ask(body.projectId, body.question);
    
    return corsResponse(answer);
  } catch (error) {
    console.error('Ask API error:', error);
    return corsResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
}