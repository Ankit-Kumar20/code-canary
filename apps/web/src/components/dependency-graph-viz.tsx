'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { EnrichedSBOM, Package } from '@dependency-canary/shared';

interface DependencyGraphVizProps {
  sbom: EnrichedSBOM;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  version: string;
  direct: boolean;
  severity: string;
  group: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
}

export default function DependencyGraphViz({ sbom }: DependencyGraphVizProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [depth, setDepth] = useState(1);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], links: GraphLink[] }>({ nodes: [], links: [] });

  // Build graph data based on depth
  useEffect(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Add central project node
    const projectNode: GraphNode = {
      id: 'PROJECT_ROOT',
      name: sbom.projectId,
      version: 'main',
      direct: true,
      severity: 'NONE',
      group: 0 // Central node group
    };
    nodes.push(projectNode);
    nodeMap.set(projectNode.id, projectNode);

    // Add all packages that should be shown based on depth
    sbom.packages.forEach((pkg) => {
      // Show direct dependencies always, and transitive based on depth
      if (pkg.direct || depth > 1) {
        const node: GraphNode = {
          id: `${pkg.name}@${pkg.version}`,
          name: pkg.name,
          version: pkg.version,
          direct: pkg.direct,
          severity: getHighestSeverity(pkg),
          group: pkg.direct ? 1 : 2
        };
        nodes.push(node);
        nodeMap.set(node.id, node);
      }
    });

    // Add links from project to direct dependencies
    sbom.packages.forEach(pkg => {
      if (pkg.direct) {
        const targetId = `${pkg.name}@${pkg.version}`;
        if (nodeMap.has(targetId)) {
          links.push({ 
            source: 'PROJECT_ROOT', 
            target: targetId 
          });
        }
      }
    });

    // Add links between packages (for depth > 1)
    if (depth > 1) {
      sbom.packages.forEach(pkg => {
        if (pkg.direct || depth > 1) {
          const sourceId = `${pkg.name}@${pkg.version}`;
          
          // Add requires relationships
          if (pkg.requires && pkg.requires.length > 0) {
            pkg.requires.forEach(required => {
              const targetId = `${required.name}@${required.version}`;
              
              // Only add link if both nodes exist in our graph
              if (nodeMap.has(sourceId) && nodeMap.has(targetId)) {
                links.push({ 
                  source: sourceId, 
                  target: targetId 
                });
              }
            });
          }
        }
      });
    }

    console.log('Graph data:', { nodes: nodes.length, links: links.length, depth });
    setGraphData({ nodes, links });
  }, [sbom, depth]);

  // Render the graph
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;

    // Set SVG dimensions
    svg.attr("width", width).attr("height", height);

    // Create simulation
    const simulation = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Create links
    const link = svg.append("g")
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1);

    // Create nodes
    const node = svg.append("g")
      .selectAll("circle")
      .data(graphData.nodes)
      .join("circle")
      .attr("r", (d: any) => d.group === 0 ? 12 : (d.direct ? 8 : 5))
      .attr("fill", (d: any) => d.group === 0 ? "#3b82f6" : getSeverityColor(d.severity))
      .attr("stroke", (d: any) => d.group === 0 ? "#1d4ed8" : (d.direct ? "#333" : "#666"))
      .attr("stroke-width", (d: any) => d.group === 0 ? 3 : (d.direct ? 2 : 1))
      .call(drag(simulation) as any);

    // Create labels
    const label = svg.append("g")
      .selectAll("text")
      .data(graphData.nodes)
      .join("text")
      .text((d: any) => d.group === 0 ? d.name : d.name)
      .attr("font-size", (d: any) => d.group === 0 ? "12px" : "10px")
      .attr("font-weight", (d: any) => d.group === 0 ? "bold" : "normal")
      .attr("fill", "#374151")
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => d.group === 0 ? "25" : "15")
      .call(drag(simulation) as any);

    // Add tooltips
    node.append("title")
      .text((d: any) => d.group === 0 ? 
        `Project: ${d.name}\nRoot node` : 
        `${d.name}@${d.version}\n${d.direct ? 'Direct' : 'Transitive'}\nSeverity: ${d.severity}`
      );



    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      label
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    // Drag behavior
    function drag(simulation: d3.Simulation<any, undefined>) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    return () => {
      simulation.stop();
    };
  }, [graphData]);

  function getHighestSeverity(pkg: Package): string {
    if (!pkg.vulns || pkg.vulns.length === 0) return 'NONE';
    
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    for (const severity of severityOrder) {
      if (pkg.vulns.some(v => v.severity === severity)) {
        return severity;
      }
    }
    return 'NONE';
  }

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'CRITICAL': return '#e11d48';
      case 'HIGH': return '#ea580c';
      case 'MEDIUM': return '#d97706';
      case 'LOW': return '#2563eb';
      default: return '#64748b';
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[16px] font-semibold text-ink">Dependency Topology Graph</h3>
          <p className="text-[12px] text-ink-muted">Interactive visual simulation of package relationships and risk nodes</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-medium text-ink-muted">Depth View:</label>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-ink shadow-subtle transition-all hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value={1}>Direct Dependencies (1 Level)</option>
            <option value={2}>Direct + Transitive (2 Levels)</option>
            <option value={3}>Full Complete Tree</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line-subtle bg-canvas/40 p-3.5 text-[12px]">
        <div className="flex items-center gap-4 flex-wrap text-ink-muted">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span>Root Project</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span>Clean / Safe</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1.5 text-orange-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span>High</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-600 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span>Critical</span>
          </div>
        </div>
        <p className="text-[11.5px] text-ink-faint">
          Graph displaying {graphData.nodes.length - 1} connected packages ({graphData.nodes.filter(n => n.direct && n.group !== 0).length} direct, {graphData.nodes.filter(n => !n.direct).length} transitive). Drag nodes to reposition.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-canvas/20 shadow-inner">
        <svg
          ref={svgRef}
          width="800"
          height="600"
          className="w-full h-auto cursor-grab active:cursor-grabbing"
          style={{ minHeight: '600px' }}
        />
      </div>

      {graphData.nodes.length === 0 && (
        <div className="py-12 text-center text-[13px] text-ink-faint">
          No dependency nodes to display at this depth level.
        </div>
      )}
    </div>
  );
} 