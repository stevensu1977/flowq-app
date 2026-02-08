
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { DiagramNode } from '../types';

interface ArchitectureDiagramProps {
  data: DiagramNode;
}

const ArchitectureDiagram: React.FC<ArchitectureDiagramProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    const width = 800;
    const height = 400;
    const margin = { top: 40, right: 90, bottom: 50, left: 90 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const tree = d3.tree<DiagramNode>().size([width - margin.left - margin.right, height - margin.top - margin.bottom]);
    const root = d3.hierarchy(data);
    tree(root);

    // Links
    g.selectAll(".link")
      .data(root.links())
      .enter().append("path")
      .attr("class", "link")
      .attr("d", d3.linkVertical()
        .x(d => (d as any).x)
        .y(d => (d as any).y) as any)
      .attr("fill", "none")
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 2);

    // Nodes
    const node = g.selectAll(".node")
      .data(root.descendants())
      .enter().append("g")
      .attr("class", d => "node" + (d.children ? " node--internal" : " node--leaf"))
      .attr("transform", d => `translate(${(d as any).x},${(d as any).y})`);

    node.append("rect")
      .attr("width", 140)
      .attr("height", 40)
      .attr("x", -70)
      .attr("y", -20)
      .attr("rx", 6)
      .attr("fill", "white")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5)
      .style("filter", "drop-shadow(0px 2px 4px rgba(0,0,0,0.02))");

    node.append("text")
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "500")
      .attr("fill", "#334155")
      .text(d => d.data.name);

  }, [data]);

  return (
    <div className="w-full overflow-x-auto bg-gray-50 border border-gray-100 rounded-2xl p-6 my-4 shadow-sm">
      <svg 
        ref={svgRef} 
        viewBox="0 0 800 400" 
        className="mx-auto w-full h-auto max-w-[800px]"
        preserveAspectRatio="xMidYMid meet"
      />
    </div>
  );
};

export default ArchitectureDiagram;
