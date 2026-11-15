import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ReportGenerator } from '@/lib/report-generator';
import { agentService } from '@/lib/agent-service';
import { marked } from 'marked';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!(await auth.api.getSession({ headers: request.headers }))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const format = searchParams.get('format') || 'pdf';

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    const sbom = await agentService.getSBOM(projectId);
    if (!sbom) {
      return NextResponse.json(
        { error: 'SBOM not found for project' },
        { status: 404 }
      );
    }

    const generator = new ReportGenerator();
    const markdown = generator.generateMarkdown(sbom);

    if (format === 'markdown') {
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename=report-${projectId}.md`,
        },
      });
    }

    if (format === 'pdf') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Dependency Security Report</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1, h2, h3, h4 { color: #2563eb; }
            h1 { border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
            h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-top: 30px; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8fafc; }
            code { background-color: #f1f5f9; padding: 2px 4px; border-radius: 3px; }
            .risk-high { color: #dc2626; font-weight: bold; }
            .risk-medium { color: #ea580c; }
            .risk-low { color: #16a34a; }
            @page { margin: 1in; }
          </style>
        </head>
        <body>
          ${await marked.parse(markdown)}
        </body>
        </html>
      `;

      // Load puppeteer as native ESM at request time. Its CommonJS build requires
      // yargs/yargs, which Node 26 loads as ESM and fails on, breaking `next build`.
      const { default: puppeteer } = await import(/* webpackIgnore: true */ 'puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      
      let pdf: Uint8Array;
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' },
        });
      } finally {
        await browser.close();
      }

      return new NextResponse(pdf as BufferSource, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=report-${projectId}.pdf`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid format. Supported: markdown, pdf' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Report API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
