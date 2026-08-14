const KnowledgeAssistant = require('../../src/repo/knowledgeAssistant.cjs');

function makeContext(overrides = {}) {
  return {
    resource: { rid: 'A', name: 'Alpha', pageRank: 0.2, degree: 6, incoming: 2, outgoing: 4 },
    relations: [
      { direction: 'incoming', target: 'X', targetName: 'Xray', type: 'reference' },
      { direction: 'outgoing', target: 'B', targetName: 'Bravo', type: 'wikilink' }
    ],
    neighborhood: [{ rid: 'N1', name: 'NeighborOne' }, { rid: 'N2', name: 'NeighborTwo' }],
    related: [],
    ...overrides
  };
}

function setup() {
  const ctx = {
    buildResourceContext: jest.fn(),
    buildGlobalContext: jest.fn()
  };
  const analyzer = {
    density: jest.fn(),
    islands: jest.fn(),
    gaps: jest.fn(),
    report: jest.fn()
  };
  const rec = { forgotten: jest.fn() };
  const assistant = new KnowledgeAssistant(ctx, analyzer, rec);
  return { ctx, analyzer, rec, assistant };
}

describe('KnowledgeAssistant', () => {
  describe('explain', () => {
    test('returns null when context is missing', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(null);
      expect(assistant.explain('nope')).toBeNull();
    });

    test('builds an explanation with position, relations and category', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(makeContext());
      const result = assistant.explain('A');
      expect(result.text).toContain('## Alpha');
      expect(result.text).toContain('**位置**: PageRank 0.2, 度 6 (入 2, 出 4)');
      expect(result.text).toContain('被 1 个资源引用: Xray [reference]');
      expect(result.text).toContain('引用 1 个资源: Bravo [wikilink]');
      expect(result.text).toContain('NeighborOne, NeighborTwo');
      expect(result.text).toContain('**类型**: 枢纽节点 (Hub)');
      expect(result.detail.category).toBe('枢纽节点 (Hub)');
    });

    test('classifies source nodes', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(makeContext({
        resource: { rid: 'S', name: 'Source', pageRank: 0.1, degree: 2, incoming: 0, outgoing: 2 },
        relations: [{ direction: 'outgoing', target: 'B', targetName: 'Bravo', type: 'reference' }]
      }));
      expect(assistant.explain('S').detail.category).toBe('知识源 (Source)');
    });

    test('classifies sink nodes', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(makeContext({
        resource: { rid: 'K', name: 'Sink', pageRank: 0.1, degree: 2, incoming: 2, outgoing: 0 },
        relations: [{ direction: 'incoming', target: 'B', targetName: 'Bravo', type: 'reference' }]
      }));
      expect(assistant.explain('K').detail.category).toBe('知识汇 (Sink)');
    });

    test('classifies isolated nodes', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(makeContext({
        resource: { rid: 'I', name: 'Isolated', pageRank: 0.01, degree: 0, incoming: 0, outgoing: 0 },
        relations: []
      }));
      expect(assistant.explain('I').detail.category).toBe('孤立节点');
    });
  });

  describe('summarize', () => {
    test('returns null when context is missing', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(null);
      expect(assistant.summarize('nope')).toBeNull();
    });

    test('summarizes relations, neighborhood and related', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(makeContext({
        resource: { rid: 'B', name: 'Beta', pageRank: 0.12, degree: 3, incoming: 1, outgoing: 2 },
        relations: [
          { direction: 'outgoing', target: 'A', targetName: 'Alpha', type: 'reference' },
          { direction: 'outgoing', target: 'C', targetName: 'Charlie', type: 'reference' }
        ],
        related: [{ rid: 'D', name: 'Delta', score: 0.5 }]
      }));
      const result = assistant.summarize('B');
      expect(result.text).toContain('**Beta** 是一个知识图谱中的重要资源。');
      expect(result.text).toContain('- 直接关联: 2 条关系，连接 2 个不同资源');
      expect(result.text).toContain('- 知识邻域: 2 个相邻资源');
      expect(result.text).toContain('- 相关推荐: Delta');
      expect(result.text).toContain('- 重要性: 核心节点 (PR=0.12)');
      expect(result.detail).toEqual({
        resource: expect.objectContaining({ rid: 'B' }),
        neighborCount: 2,
        relationCount: 2,
        uniqueConnections: 2
      });
    });

    test('notes when resource is isolated', () => {
      const { ctx, assistant } = setup();
      ctx.buildResourceContext.mockReturnValue(makeContext({
        resource: { rid: 'I', name: 'Iso', pageRank: 0.01, degree: 0, incoming: 0, outgoing: 0 },
        relations: []
      }));
      const result = assistant.summarize('I');
      expect(result.text).toContain('孤立资源');
      expect(result.text).toContain('- 注意: 此资源尚未与任何其他资源建立关系');
    });
  });

  describe('ask', () => {
    function defaultAnalyzer(analyzer) {
      analyzer.density.mockReturnValue({ density: 0.5, level: 'moderate' });
      analyzer.islands.mockReturnValue([]);
      analyzer.gaps.mockReturnValue([]);
      analyzer.report.mockReturnValue({ clusters: { total: 3 } });
    }

    function defaultGlobal(ctx) {
      ctx.buildGlobalContext.mockReturnValue({
        overview: { totalResources: 10, totalRelations: 8 },
        topNodes: [{ rid: 'c1', name: 'Core', degree: 4 }],
        isolated: []
      });
    }

    test('answers gap queries', () => {
      const { ctx, analyzer, assistant } = setup();
      defaultGlobal(ctx);
      analyzer.density.mockReturnValue({ density: 0.5, level: 'moderate' });
      analyzer.islands.mockReturnValue([{ size: 1, nodes: ['iso1'] }]);
      analyzer.gaps.mockReturnValue([{ from: 'a', to: 'b', suggested: 'n' }]);
      analyzer.report.mockReturnValue({ clusters: { total: 2 } });

      const result = assistant.ask('缺少什么知识');
      expect(result.text).toContain('## 知识缺口分析');
      expect(result.text).toContain('发现 **1** 个孤立资源');
      expect(result.text).toContain('潜在知识缺口');
      expect(result.text).toContain('a');
      expect(result.text).toContain('建议通过');
    });

    test('reports healthy structure when no gaps found', () => {
      const { ctx, analyzer, assistant } = setup();
      defaultGlobal(ctx);
      analyzer.density.mockReturnValue({ density: 0.5, level: 'moderate' });
      analyzer.islands.mockReturnValue([]);
      analyzer.gaps.mockReturnValue([]);
      analyzer.report.mockReturnValue({ clusters: { total: 1 } });

      const result = assistant.ask('还缺什么');
      expect(result.text).toContain('当前知识结构连接良好');
    });

    test('answers importance queries', () => {
      const { ctx, analyzer, assistant } = setup();
      defaultGlobal(ctx);
      defaultAnalyzer(analyzer);
      const result = assistant.ask('哪些是核心节点');
      expect(result.text).toContain('## 核心知识节点');
      expect(result.text).toContain('1. **Core** — 度 4');
    });

    test('answers recommendation queries with forgotten items', () => {
      const { ctx, analyzer, rec, assistant } = setup();
      defaultGlobal(ctx);
      analyzer.density.mockReturnValue({ density: 0.2, level: 'sparse' });
      analyzer.islands.mockReturnValue([]);
      analyzer.gaps.mockReturnValue([]);
      analyzer.report.mockReturnValue({ clusters: { total: 1 } });
      rec.forgotten.mockReturnValue([{ rid: 'f1', reason: 'old but important' }]);

      const result = assistant.ask('给我推荐');
      expect(result.text).toContain('## 知识建议');
      expect(result.text).toContain('当前知识网络较为稀疏');
      expect(result.text).toContain('可能被遗忘的重要知识');
      expect(result.text).toContain('- f1: old but important');
      expect(rec.forgotten).toHaveBeenCalledWith({ topN: 3 });
    });

    test('answers generic queries with an overview', () => {
      const { ctx, analyzer, assistant } = setup();
      defaultGlobal(ctx);
      defaultAnalyzer(analyzer);
      const result = assistant.ask('帮我看看');
      expect(result.text).toContain('## 知识图谱概览');
      expect(result.text).toContain('资源总数: **10**');
      expect(result.text).toContain('关系总数: **8**');
      expect(result.text).toContain('知识密度: **0.5** (moderate)');
      expect(result.text).toContain('连通簇: **3**');
      expect(result.text).toContain('核心节点: Core');
    });

    test('omits core nodes when none exist', () => {
      const { ctx, analyzer, assistant } = setup();
      ctx.buildGlobalContext.mockReturnValue({
        overview: { totalResources: 0, totalRelations: 0 },
        topNodes: [],
        isolated: []
      });
      defaultAnalyzer(analyzer);
      const result = assistant.ask('核心');
      expect(result.text).toContain('暂无足够数据确定核心节点');
    });
  });
});
