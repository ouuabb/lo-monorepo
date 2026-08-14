/**
 * ReasoningEngine — 推理引擎
 *
 * Phase 6.7: 理解问题、检索知识、关系推理、决策。
 *
 * 输出: { thoughts, evidence, conclusion, confidence }
 */

class ReasoningEngine {
  /**
   * @param {object} [services]
   * @param {import('./knowledgeReasoner.cjs')} [services.knowledgeReasoner]
   * @param {import('./semanticMemory.cjs')} [services.semanticMemory]
   * @param {import('./conceptMemory.cjs')} [services.conceptMemory]
   * @param {object} [services.repository]
   * @param {object} [services.graphEngine]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.knowledgeReasoner = services.knowledgeReasoner || null;
    this.semanticMemory = services.semanticMemory || null;
    this.conceptMemory = services.conceptMemory || null;
    this.repository = services.repository || null;
    this.graphEngine = services.graphEngine || null;
    this.logger = services.logger || console;
  }

  /**
   * 推理
   * @param {import('./aiRequest.cjs')} request
   * @returns {{ thoughts: Array, evidence: Array, conclusion: string, confidence: number }}
   */
  async reason(request) {
    const thoughts = [];
    const evidence = [];

    // Step 1: 理解问题
    thoughts.push({ step: 'understand', content: `Mode: ${request.mode}, Input: ${request.input}` });

    // Step 2: 检索记忆
    if (this.semanticMemory) {
      try {
        const memories = await this.semanticMemory.retrieve(request.input, 5);
        evidence.push({ source: 'semantic_memory', items: memories.length });
        thoughts.push({ step: 'memory_retrieval', content: `Found ${memories.length} relevant memories` });
      } catch (e) { this.logger.error('reasoningEngine: memory retrieval failed', e); }
    }

    // Step 3: 图谱分析
    if (this.knowledgeReasoner && request.mode === 'analysis') {
      try {
        const graphAnalysis = await this.knowledgeReasoner.analyzeGraph();
        evidence.push({ source: 'graph_analysis', data: graphAnalysis });
        thoughts.push({ step: 'graph_analysis', content: `Graph analyzed: ${graphAnalysis.nodeCount || 0} nodes, ${graphAnalysis.edgeCount || 0} edges` });
      } catch (e) { this.logger.error('reasoningEngine: graph analysis failed', e); }
    }

    // Step 4: 知识缺口
    if (this.knowledgeReasoner && request.mode === 'research') {
      try {
        const gaps = await this.knowledgeReasoner.detectKnowledgeGaps();
        evidence.push({ source: 'knowledge_gaps', items: gaps.length });
        thoughts.push({ step: 'gap_detection', content: `Found ${gaps.length} knowledge gaps` });
      } catch (e) { this.logger.error('reasoningEngine: knowledge gap detection failed', e); }
    }

    // Step 5: 概念发现
    if (this.conceptMemory && request.mode === 'research') {
      try {
        const concepts = await this.conceptMemory.search(request.input, 3);
        evidence.push({ source: 'concept_memory', items: concepts.length });
        thoughts.push({ step: 'concept_search', content: `Found ${concepts.length} related concepts` });
      } catch (e) { this.logger.error('reasoningEngine: concept search failed', e); }
    }

    // Conclusion
    let conclusion;
    let confidence = 0.5;

    switch (request.mode) {
      case 'analysis':
        conclusion = `Analysis completed. ${evidence.length} evidence sources evaluated.`;
        confidence = 0.7;
        break;
      case 'research':
        conclusion = `Research completed. ${evidence.length} sources examined.`;
        confidence = 0.6;
        break;
      default:
        conclusion = `Processed: ${request.input}`;
        confidence = 0.5;
    }

    return { thoughts, evidence, conclusion, confidence };
  }
}

module.exports = ReasoningEngine;
