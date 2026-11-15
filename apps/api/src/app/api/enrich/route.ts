import { NextRequest, NextResponse } from 'next/server';
import { createModalClient } from '@dependency-canary/shared';
import { corsResponse } from '@/lib/cors';
import { agentService } from '@/lib/agent-service';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return corsResponse(
        { error: 'Missing jobId parameter' },
        400
      );
    }

    const client = createModalClient();
    const sbom = await client.enrich(jobId);

    // Index the SBOM in the agent service for semantic graph & QA search
    console.log(`Indexing SBOM for agent access: ${sbom.projectId}...`);
    await agentService.indexSBOM(sbom);

    return corsResponse(sbom);
  } catch (error) {
    console.error('Enrich API error:', error);
    return corsResponse(
      { error: 'Internal server error' },
      500
    );
  }
}
