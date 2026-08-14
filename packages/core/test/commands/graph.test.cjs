const path = require('path');

jest.mock('../../src/repo/repository.cjs', () => jest.fn());
jest.mock('../../src/event/eventStore.cjs', () => jest.fn(() => ({ get: jest.fn().mockResolvedValue(null) })));
jest.mock('../../src/plugin/pluginRegistryClient.cjs', () => ({
  fetchRegistry: jest.fn(),
  DEFAULT_PLUGIN_REGISTRY: 'https://registry.example.com/index.json'
}));
jest.mock('../../src/commands/serve.cjs', () => jest.fn().mockResolvedValue());

const Repository = require('../../src/repo/repository.cjs');
const graph = require('../../src/commands/graph.cjs');
const { fetchRegistry } = require('../../src/plugin/pluginRegistryClient.cjs');
const EventStore = require('../../src/event/eventStore.cjs');

function buildRepo() {
  const builder = {
    outgoing: jest.fn().mockReturnThis(),
    incoming: jest.fn().mockReturnThis(),
    both: jest.fn().mockReturnThis(),
    depth: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    run: jest.fn().mockReturnValue([])
  };
  builder.from = jest.fn().mockResolvedValue(builder);
  const engine = { diagnose: jest.fn().mockResolvedValue({
    state: { health: 'ok', connectivity: 1, maturity: 'mature' },
    health: { issues: [] },
    opportunities: [],
    strategies: []
  }) };
  const repo = {
    open: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    resolveResource: jest.fn().mockResolvedValue({ rid: 'res_1', name: 'Test', type: 'note' }),
    getResource: jest.fn().mockResolvedValue(null),
    getNeighbors: jest.fn().mockResolvedValue([]),
    getBacklinks: jest.fn().mockResolvedValue([]),
    findPath: jest.fn().mockResolvedValue({ length: 2, path: ['res_1', 'res_2'] }),
    detectCycles: jest.fn().mockResolvedValue([]),
    exportVisualGraph: jest.fn().mockResolvedValue('{"nodes":[]}'),
    exportGraph: jest.fn().mockResolvedValue('digraph G {}'),
    getPageRank: jest.fn().mockResolvedValue([]),
    getCentralNodes: jest.fn().mockResolvedValue([]),
    getIsolatedNodes: jest.fn().mockResolvedValue([]),
    getClusters: jest.fn().mockResolvedValue([]),
    queryGraph: jest.fn().mockReturnValue(builder),
    getResourceNeighborhood: jest.fn().mockResolvedValue({ depth: 2, nodes: [], edges: [] }),
    getExplainPath: jest.fn().mockResolvedValue({ length: 1, explanation: ['step'], path: ['a', 'b'] }),
    getRelatedResources: jest.fn().mockResolvedValue([]),
    getBacklinkDetails: jest.fn().mockResolvedValue([]),
    analyzeImpact: jest.fn().mockResolvedValue({ score: 1, totalImpacted: 0, direct: 0, indirect: 0, directList: [], indirectList: [] }),
    getKnowledgeReport: jest.fn().mockResolvedValue({
      density: { resources: 1, relations: 1, density: 0.5, level: 'medium' },
      clusters: { total: 1, core: 1, isolated: 0, largest: 1 },
      gaps: []
    }),
    findKnowledgeGaps: jest.fn().mockResolvedValue([]),
    getRecommendations: jest.fn().mockResolvedValue([]),
    getNextLearning: jest.fn().mockResolvedValue([]),
    getKnowledgeTimeline: jest.fn().mockResolvedValue({
      monthly: [], growth: { total: 0, linked: 0, months: 0, rate: 0 }, activity: { trend: 'stable' }
    }),
    getSuggestionStats: jest.fn().mockResolvedValue({ pending: 0, approved: 0, rejected: 0 }),
    listSuggestions: jest.fn().mockResolvedValue([]),
    approveSuggestion: jest.fn().mockResolvedValue({ id: 's1', source: 'a', target: 'b' }),
    executeApprovedSuggestion: jest.fn().mockResolvedValue({ type: 'ref', from_rid: 'a', to_rid: 'b' }),
    rejectSuggestion: jest.fn().mockResolvedValue(),
    explainWithAI: jest.fn().mockResolvedValue(null),
    summarizeWithAI: jest.fn().mockResolvedValue(null),
    askKnowledge: jest.fn().mockResolvedValue({ text: 'answer' }),
    runAutomation: jest.fn().mockResolvedValue({ lifecycle: { active: 1, inactive: 0, forgotten: 0, archived: 0 }, repair: { brokenCount: 0, orphanCount: 0, duplicateCount: 0 }, suggestions: [] }),
    getKnowledgeLifecycle: jest.fn().mockResolvedValue({ summary: { active: 1, inactive: 0, forgotten: 0, archived: 0, total: 1 }, resources: [] }),
    runKnowledgeRepair: jest.fn().mockResolvedValue({ brokenRelations: [], orphanResources: [], duplicateCandidates: [], summary: { totalIssues: 0 } }),
    listFederatedRepositories: jest.fn().mockResolvedValue([]),
    registerFederatedRepository: jest.fn().mockResolvedValue({ namespace: 'ns', path: '/x' }),
    removeFederatedRepository: jest.fn().mockResolvedValue({ removed: true }),
    syncPull: jest.fn().mockResolvedValue({ status: { imported: 1, conflicts: 0 } }),
    syncPush: jest.fn().mockResolvedValue({ pushed: 2 }),
    getSyncStatus: jest.fn().mockResolvedValue({ resources: 1, remoteResources: 2, relations: 1, conflicts: 0, lastSync: null }),
    listConflicts: jest.fn().mockResolvedValue([]),
    resolveConflict: jest.fn().mockResolvedValue({ ok: true }),
    queryFederatedGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    analyzeEvolution: jest.fn().mockResolvedValue({ growth: null, velocity: null, entropy: null, trend: null }),
    detectKnowledgePatterns: jest.fn().mockResolvedValue({}),
    generateKnowledgeStrategy: jest.fn().mockResolvedValue([]),
    createKnowledgeSnapshot: jest.fn().mockResolvedValue({ id: 'snap1', created_at: Date.now(), resourceCount: 1, relationCount: 1, density: 0.5, entropy: 0.5, growth: 0 }),
    listPlugins: jest.fn().mockResolvedValue([]),
    enablePlugin: jest.fn().mockResolvedValue(),
    disablePlugin: jest.fn().mockResolvedValue(),
    reloadPlugin: jest.fn().mockResolvedValue(),
    getPluginManager: jest.fn().mockReturnValue({ getPlugin: jest.fn(() => null), getContext: jest.fn(() => null) }),
    getPluginExtensionRegistry: jest.fn().mockReturnValue({ types: jest.fn(() => []), list: jest.fn(() => []) }),
    getPluginHookManager: jest.fn().mockReturnValue({ hookNames: jest.fn(() => []), listenerCount: jest.fn(() => 0) }),
    getDiscoveryService: jest.fn().mockReturnValue({ listProviders: jest.fn(() => []), discover: jest.fn(), watch: jest.fn().mockResolvedValue(), stopAllWatchers: jest.fn().mockResolvedValue() }),
    installPlugin: jest.fn().mockResolvedValue({ id: 'p', name: 'Name', version: '1.0.0' }),
    uninstallPlugin: jest.fn().mockResolvedValue(),
    getPluginConfig: jest.fn().mockResolvedValue({}),
    setPluginConfig: jest.fn().mockResolvedValue(),
    updatePlugin: jest.fn().mockResolvedValue({ upToDate: true, currentVersion: '1.0.0' }),
    getEventHistory: jest.fn().mockResolvedValue([]),
    getEventStats: jest.fn().mockResolvedValue([]),
    getRegisteredEventTypes: jest.fn().mockResolvedValue([]),
    getEventListeners: jest.fn().mockResolvedValue(0),
    replayEvents: jest.fn().mockResolvedValue([]),
    initWorkflowSystem: jest.fn().mockResolvedValue(),
    listWorkflows: jest.fn().mockResolvedValue([]),
    getWorkflow: jest.fn().mockResolvedValue(null),
    listWorkflowVersions: jest.fn().mockResolvedValue([]),
    getWorkflowVersion: jest.fn().mockResolvedValue(null),
    createWorkflow: jest.fn().mockResolvedValue({ id: 'wf', states: [], transitions: [] }),
    updateWorkflow: jest.fn().mockResolvedValue({ id: 'wf', states: [], transitions: [] }),
    purgeWorkflow: jest.fn().mockResolvedValue(),
    deleteWorkflow: jest.fn().mockResolvedValue(),
    attachWorkflow: jest.fn().mockResolvedValue({ resourceRid: 'r', workflowId: 'wf', id: 'i', currentState: 's', workflowVersion: 1 }),
    detachWorkflow: jest.fn().mockResolvedValue(true),
    resumeWorkflow: jest.fn().mockResolvedValue({ id: 'i', currentState: 's', workflowVersion: 1 }),
    transitionWorkflow: jest.fn().mockResolvedValue({ workflowId: 'wf', id: 'i', currentState: 's' }),
    canTransitionWorkflow: jest.fn().mockResolvedValue({ allowed: true, reason: '' }),
    listWorkflowInstances: jest.fn().mockResolvedValue([]),
    getWorkflowInstance: jest.fn().mockResolvedValue(null),
    getWorkflowHistory: jest.fn().mockResolvedValue([]),
    initPermissionSystem: jest.fn().mockResolvedValue(),
    listRoles: jest.fn().mockResolvedValue([]),
    checkPermission: jest.fn().mockResolvedValue({ allowed: true, reason: 'ok' }),
    getPermissionAudit: jest.fn().mockResolvedValue([]),
    getDeniedPermissionStats: jest.fn().mockResolvedValue([]),
    grantPermission: jest.fn().mockResolvedValue(),
    initAgentSystem: jest.fn().mockResolvedValue(),
    listAgents: jest.fn().mockResolvedValue([]),
    getAgentMemory: jest.fn().mockResolvedValue([]),
    executeAgent: jest.fn().mockResolvedValue({ agentId: 'a', goal: 'g', plan: [], result: { success: true, steps: 1 } }),
    initCollaborationSystem: jest.fn().mockResolvedValue(),
    listAgentTeams: jest.fn().mockResolvedValue([]),
    executeAgentTeam: jest.fn().mockResolvedValue({ teamId: 't', goal: 'g', status: 'completed', completedSubtasks: 1, subtaskCount: 1 }),
    getAgentMessages: jest.fn().mockResolvedValue([]),
    sendAgentMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    initAIOS: jest.fn().mockResolvedValue(),
    getAIStatus: jest.fn().mockResolvedValue({ running: false, memory: null, concepts: null, learning: null }),
    askAI: jest.fn().mockResolvedValue({ confidence: 0.8, content: 'hi', reasoning: null, actions: [] }),
    analyzeKnowledge: jest.fn().mockResolvedValue({ content: 'x', confidence: 0.5, actions: [] }),
    getAIInsights: jest.fn().mockResolvedValue([]),
    initEvolutionEngine: jest.fn().mockResolvedValue(),
    getEvolutionStatus: jest.fn().mockResolvedValue({
      state: { version: 1, maturity: 'm', connectivity: 1, complexity: 1, score: 1 },
      health: { healthScore: 100, issues: [], recommendations: [] },
      memory: { totalEvolutions: 0, improvementRate: 0 }
    }),
    _getEvolutionEngine: jest.fn().mockReturnValue(engine),
    executeEvolution: jest.fn().mockResolvedValue({ evolved: false, reason: 'none' }),
    getEvolutionHistory: jest.fn().mockResolvedValue([]),
    db: {}
  };
  return repo;
}

describe('graph command', () => {
  let repo;

  beforeEach(() => {
    repo = buildRepo();
    Repository.mockImplementation(() => repo);
    fetchRegistry.mockReset();
    EventStore.mockImplementation(() => ({ get: jest.fn().mockResolvedValue(null) }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function expectExitCode(fn, argv, code) {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await fn(argv);
    expect(process.exit).toHaveBeenCalledWith(code);
    logSpy.mockRestore();
  }

  async function expectMissingResource(handler, argv = { resource: 'nope' }) {
    repo.resolveResource.mockResolvedValue(null);
    await expectExitCode(handler, argv, 1);
  }

  describe('neighbors / backlinks / path / cycles', () => {
    test('neighbors should print neighbors', async () => {
      repo.getNeighbors.mockResolvedValue(['res_2']);
      await expectExitCode(graph.neighbors, { resource: 'res_1' }, 0);
    });

    test('neighbors should error for missing resource', async () => {
      await expectMissingResource(graph.neighbors);
    });

    test('backlinks should print backlinks', async () => {
      repo.getBacklinks.mockResolvedValue(['res_2']);
      await expectExitCode(graph.backlinks, { resource: 'res_1' }, 0);
    });

    test('backlinks should error for missing resource', async () => {
      await expectMissingResource(graph.backlinks);
    });

    test('path should print a path', async () => {
      await expectExitCode(graph.path, { from: 'res_1', to: 'res_2' }, 0);
    });

    test('path should error when source is missing', async () => {
      repo.resolveResource.mockResolvedValueOnce(null);
      await expectExitCode(graph.path, { from: 'nope', to: 'res_2' }, 1);
    });

    test('path should error when target is missing', async () => {
      repo.resolveResource.mockResolvedValueOnce({ rid: 'res_1' }).mockResolvedValueOnce(null);
      await expectExitCode(graph.path, { from: 'res_1', to: 'nope' }, 1);
    });

    test('path should print unreachable message', async () => {
      repo.findPath.mockResolvedValue(null);
      await expectExitCode(graph.path, { from: 'res_1', to: 'res_2' }, 0);
    });

    test('cycles should print detected cycles', async () => {
      repo.detectCycles.mockResolvedValue([['a', 'b', 'a']]);
      await expectExitCode(graph.cycles, {}, 0);
    });

    test('cycles should report failure on error', async () => {
      repo.detectCycles.mockRejectedValue(new Error('boom'));
      await expectExitCode(graph.cycles, {}, 1);
    });
  });

  describe('export', () => {
    test('should export simple json via legacy path', async () => {
      await expectExitCode(graph.export, { format: 'json' }, 0);
      expect(repo.exportGraph).toHaveBeenCalledWith('json');
    });

    test('should export visual json when rid provided', async () => {
      await expectExitCode(graph.export, { format: 'json', rid: 'res_1', depth: 3 }, 0);
      expect(repo.exportVisualGraph).toHaveBeenCalled();
    });

    test('should export html', async () => {
      await expectExitCode(graph.export, { format: 'html' }, 0);
    });

    test('should export svg with layout', async () => {
      await expectExitCode(graph.export, { format: 'svg', layout: 'hierarchical' }, 0);
    });

    test('should write output to a file when output given', async () => {
      const output = path.join(require('os').tmpdir(), `graph-out-${Date.now()}.json`);
      await expectExitCode(graph.export, { format: 'dot', output }, 0);
      expect(repo.exportGraph).toHaveBeenCalledWith('dot');
      require('fs-extra').removeSync(output);
    });

    test('should report failure on error', async () => {
      repo.exportGraph.mockRejectedValue(new Error('boom'));
      await expectExitCode(graph.export, { format: 'dot' }, 1);
    });
  });

  describe('analyze', () => {
    test('should analyze pagerank', async () => {
      repo.getPageRank.mockResolvedValue([{ rid: 'r1', score: 0.9 }]);
      await expectExitCode(graph.analyze, { type: 'pagerank', top: 5 }, 0);
    });

    test('should analyze central nodes', async () => {
      repo.getCentralNodes.mockResolvedValue([{ rid: 'r1', degree: 3, incoming: 1, outgoing: 2 }]);
      await expectExitCode(graph.analyze, { type: 'central', top: 5 }, 0);
    });

    test('should analyze isolated nodes', async () => {
      repo.getIsolatedNodes.mockResolvedValue(['r1']);
      await expectExitCode(graph.analyze, { type: 'isolated' }, 0);
    });

    test('should analyze isolated with more than 50 nodes', async () => {
      repo.getIsolatedNodes.mockResolvedValue(Array.from({ length: 55 }, (_, i) => `r${i}`));
      await expectExitCode(graph.analyze, { type: 'isolated' }, 0);
    });

    test('should analyze clusters', async () => {
      repo.getClusters.mockResolvedValue([{ id: 1, size: 3, nodes: ['a', 'b', 'c', 'd', 'e', 'f'] }]);
      await expectExitCode(graph.analyze, { type: 'clusters' }, 0);
    });

    test('should error and exit 1 for unknown analyze type', async () => {
      await expectExitCode(graph.analyze, { type: 'nope' }, 1);
    });

    test('should report failure on error', async () => {
      repo.getPageRank.mockRejectedValue(new Error('boom'));
      await expectExitCode(graph.analyze, { type: 'pagerank' }, 1);
    });
  });

  describe('query', () => {
    test('should run a graph query', async () => {
      await expectExitCode(graph.query, { resource: 'res_1', depth: 2, direction: 'outgoing' }, 0);
    });

    test('should run an incoming query', async () => {
      await expectExitCode(graph.query, { resource: 'res_1', direction: 'incoming' }, 0);
    });

    test('should run a typed query', async () => {
      await expectExitCode(graph.query, { resource: 'res_1', type: 'related' }, 0);
    });

    test('should error for missing resource', async () => {
      await expectMissingResource(graph.query);
    });
  });

  describe('neighborhood', () => {
    test('should print a neighborhood', async () => {
      repo.getResourceNeighborhood.mockResolvedValue({
        depth: 2, nodes: ['res_2'], edges: [{ from: 'res_1', to: 'res_2', type: 'ref' }]
      });
      repo.getResource.mockResolvedValue({ rid: 'res_2', name: 'Two' });
      await expectExitCode(graph.neighborhood, { resource: 'res_1' }, 0);
    });

    test('should print empty neighborhood', async () => {
      await expectExitCode(graph.neighborhood, { resource: 'res_1' }, 0);
    });

    test('should error for missing resource', async () => {
      await expectMissingResource(graph.neighborhood);
    });
  });

  describe('explain', () => {
    test('should print an explanation path', async () => {
      await expectExitCode(graph.explain, { a: 'res_1', b: 'res_2' }, 0);
    });

    test('should print unreachable message', async () => {
      repo.getExplainPath.mockResolvedValue(null);
      await expectExitCode(graph.explain, { a: 'res_1', b: 'res_2' }, 0);
    });

    test('should error when source missing', async () => {
      repo.resolveResource.mockResolvedValueOnce(null);
      await expectExitCode(graph.explain, { a: 'nope', b: 'res_2' }, 1);
    });

    test('should error when target missing', async () => {
      repo.resolveResource.mockResolvedValueOnce({ rid: 'res_1' }).mockResolvedValueOnce(null);
      await expectExitCode(graph.explain, { a: 'res_1', b: 'nope' }, 1);
    });
  });

  describe('related / resourceBacklinks / impact', () => {
    test('related should print recommendations', async () => {
      repo.getRelatedResources.mockResolvedValue([{ rid: 'res_2', score: 0.9, sharedNeighbors: 2, pageRank: 0.1 }]);
      repo.getResource.mockResolvedValue({ rid: 'res_2', name: 'Two' });
      await expectExitCode(graph.related, { resource: 'res_1' }, 0);
    });

    test('related should print empty state', async () => {
      await expectExitCode(graph.related, { resource: 'res_1' }, 0);
    });

    test('related should error for missing resource', async () => {
      await expectMissingResource(graph.related);
    });

    test('resourceBacklinks should print backlink details', async () => {
      repo.getBacklinkDetails.mockResolvedValue([{ rid: 'res_2', type: 'ref' }]);
      await expectExitCode(graph.resourceBacklinks, { resource: 'res_1' }, 0);
    });

    test('resourceBacklinks should error for missing resource', async () => {
      await expectMissingResource(graph.resourceBacklinks);
    });

    test('impact should print analysis', async () => {
      repo.analyzeImpact.mockResolvedValue({
        score: 5, totalImpacted: 2, direct: 1, indirect: 1,
        directList: [{ rid: 'res_2', type: 'ref' }],
        indirectList: ['res_3', 'res_4', 'res_5', 'res_6', 'res_7', 'res_8', 'res_9', 'res_10', 'res_11', 'res_12', 'res_13', 'res_14', 'res_15', 'res_16', 'res_17', 'res_18', 'res_19', 'res_20', 'res_21', 'res_22']
      });
      await expectExitCode(graph.impact, { resource: 'res_1' }, 0);
    });

    test('impact should print safe message when nothing impacted', async () => {
      await expectExitCode(graph.impact, { resource: 'res_1' }, 0);
    });
  });

  describe('knowledge reports', () => {
    test('knowledgeAnalyze should print a report', async () => {
      await expectExitCode(graph.knowledgeAnalyze, {}, 0);
    });

    test('knowledgeAnalyze should print isolated hint', async () => {
      repo.getKnowledgeReport.mockResolvedValue({
        density: { resources: 1, relations: 0, density: 0, level: 'low' },
        clusters: { total: 1, core: 0, isolated: 2, largest: 1 },
        gaps: [{ a: 1 }]
      });
      await expectExitCode(graph.knowledgeAnalyze, {}, 0);
    });

    test('knowledgeGaps should print empty state', async () => {
      await expectExitCode(graph.knowledgeGaps, {}, 0);
    });

    test('knowledgeGaps should print gaps', async () => {
      repo.findKnowledgeGaps.mockResolvedValue([
        { fromCluster: 'A', toCluster: 'B', from: 'r1', to: 'r2', sharedNeighbors: ['x'], suggested: 'r3' }
      ]);
      await expectExitCode(graph.knowledgeGaps, {}, 0);
    });

    test('knowledgeRecommend should print recommendations', async () => {
      repo.getRecommendations.mockResolvedValue([{ rid: 'r2', reason: 'why', score: 0.5, rank: 1 }]);
      repo.getNextLearning.mockResolvedValue([{ rid: 'r3', reason: 'next', linkCount: 2 }]);
      await expectExitCode(graph.knowledgeRecommend, { resource: 'res_1' }, 0);
    });

    test('knowledgeRecommend should error for missing resource', async () => {
      await expectMissingResource(graph.knowledgeRecommend);
    });

    test('knowledgeTimeline should print a timeline', async () => {
      repo.getKnowledgeTimeline.mockResolvedValue({
        monthly: [{ month: '2026-01', linked: 3, total: 4 }],
        growth: { total: 4, linked: 3, months: 1, rate: 3 },
        activity: { trend: 'up' }
      });
      await expectExitCode(graph.knowledgeTimeline, {}, 0);
    });
  });

  describe('suggestions', () => {
    test('suggestionList should print empty state', async () => {
      await expectExitCode(graph.suggestionList, {}, 0);
    });

    test('suggestionList should print suggestions with status filter', async () => {
      repo.listSuggestions.mockResolvedValue([
        { id: 's1', status: 'approved', source: 'a', target: 'b', payload: { suggestedType: 'ref' }, confidence: 0.8, reason: 'r' }
      ]);
      await expectExitCode(graph.suggestionList, { status: 'approved' }, 0);
    });

    test('suggestionApprove should approve', async () => {
      await expectExitCode(graph.suggestionApprove, { id: 's1' }, 0);
    });

    test('suggestionExecute should execute', async () => {
      await expectExitCode(graph.suggestionExecute, { id: 's1' }, 0);
    });

    test('suggestionReject should reject', async () => {
      await expectExitCode(graph.suggestionReject, { id: 's1' }, 0);
    });

    test('suggestionApprove should report failure on error', async () => {
      repo.approveSuggestion.mockRejectedValue(new Error('boom'));
      await expectExitCode(graph.suggestionApprove, { id: 's1' }, 1);
    });
  });

  describe('knowledge AI', () => {
    test('knowledgeAIExplain should print no context', async () => {
      await expectExitCode(graph.knowledgeAIExplain, { resource: 'res_1' }, 0);
    });

    test('knowledgeAIExplain should print explanation', async () => {
      repo.explainWithAI.mockResolvedValue({ text: 'explained' });
      await expectExitCode(graph.knowledgeAIExplain, { resource: 'res_1' }, 0);
    });

    test('knowledgeAISummarize should print summary', async () => {
      repo.summarizeWithAI.mockResolvedValue({ text: 'summary' });
      await expectExitCode(graph.knowledgeAISummarize, { resource: 'res_1' }, 0);
    });

    test('knowledgeAISummarize should error for missing resource', async () => {
      await expectMissingResource(graph.knowledgeAISummarize);
    });

    test('knowledgeAIAsk should ask with a query', async () => {
      await expectExitCode(graph.knowledgeAIAsk, { query: 'what is x' }, 0);
    });

    test('knowledgeAIAsk should default the query', async () => {
      await expectExitCode(graph.knowledgeAIAsk, { _: ['lo', 'knowledge', 'ask'] }, 0);
    });
  });

  describe('knowledge lifecycle', () => {
    test('knowledgeLifecycle should print active summary', async () => {
      await expectExitCode(graph.knowledgeLifecycle, {}, 0);
    });

    test('knowledgeLifecycle should print forgotten and inactive resources', async () => {
      repo.getKnowledgeLifecycle.mockResolvedValue({
        summary: { active: 1, inactive: 2, forgotten: 1, archived: 0, total: 4 },
        resources: [
          { state: 'forgotten', rid: 'r1', name: 'old', reason: 'stale' },
          { state: 'inactive', rid: 'r2', name: 'quiet' },
          { state: 'inactive', rid: 'r3', name: 'q2' },
          { state: 'inactive', rid: 'r4', name: 'q3' },
          { state: 'inactive', rid: 'r5', name: 'q4' },
          { state: 'inactive', rid: 'r6', name: 'q5' },
          { state: 'inactive', rid: 'r7', name: 'q6' },
          { state: 'inactive', rid: 'r8', name: 'q7' },
          { state: 'inactive', rid: 'r9', name: 'q8' },
          { state: 'inactive', rid: 'r10', name: 'q9' },
          { state: 'inactive', rid: 'r11', name: 'q10' },
          { state: 'inactive', rid: 'r12', name: 'q11' }
        ]
      });
      await expectExitCode(graph.knowledgeLifecycle, {}, 0);
    });
  });

  describe('knowledge repair', () => {
    test('knowledgeRepairDiagnosis should print clean state', async () => {
      await expectExitCode(graph.knowledgeRepairDiagnosis, {}, 0);
    });

    test('knowledgeRepairDiagnosis should print issues', async () => {
      repo.runKnowledgeRepair.mockResolvedValue({
        brokenRelations: Array.from({ length: 12 }, (_, i) => ({ id: i, from_rid: 'a', to_rid: 'b', suggestion: { reason: 'r' } })),
        orphanResources: Array.from({ length: 12 }, (_, i) => ({ rid: `r${i}`, name: 'n', type: 'note' })),
        duplicateCandidates: [{ resourceA: { name: 'A' }, resourceB: { name: 'B' }, similarity: 0.9 }],
        summary: { totalIssues: 3 }
      });
      await expectExitCode(graph.knowledgeRepairDiagnosis, {}, 0);
    });
  });

  describe('federation', () => {
    test('federationList should print empty state', async () => {
      await expectExitCode(graph.federationList, {}, 0);
    });

    test('federationList should print repos', async () => {
      repo.listFederatedRepositories.mockResolvedValue([{ namespace: 'ns', name: 'N', path: '/x' }]);
      await expectExitCode(graph.federationList, {}, 0);
    });

    test('federationAdd should register', async () => {
      await expectExitCode(graph.federationAdd, { path: '/x', namespace: 'ns' }, 0);
      expect(repo.registerFederatedRepository).toHaveBeenCalledWith('x', 'ns', '/x');
    });

    test('federationRemove should remove', async () => {
      await expectExitCode(graph.federationRemove, { namespace: 'ns' }, 0);
    });
  });

  describe('sync', () => {
    test('syncPull should pull', async () => {
      await expectExitCode(graph.syncPull, { namespace: 'ns' }, 0);
    });

    test('syncPull should print conflicts', async () => {
      repo.syncPull.mockResolvedValue({ status: { imported: 1, conflicts: 2 } });
      await expectExitCode(graph.syncPull, { namespace: 'ns' }, 0);
    });

    test('syncPush should push', async () => {
      await expectExitCode(graph.syncPush, { namespace: 'ns' }, 0);
    });

    test('syncStatus should print status', async () => {
      await expectExitCode(graph.syncStatus, {}, 0);
    });

    test('syncStatus should print last sync', async () => {
      repo.getSyncStatus.mockResolvedValue({
        resources: 1, remoteResources: 2, relations: 1, conflicts: 1,
        lastSync: { type: 'pull', created: Date.now() }
      });
      await expectExitCode(graph.syncStatus, {}, 0);
    });

    test('syncConflictList should print empty state', async () => {
      await expectExitCode(graph.syncConflictList, {}, 0);
    });

    test('syncConflictList should print conflicts', async () => {
      repo.listConflicts.mockResolvedValue([{ id: 'c1', resource: 'r', type: 'ref' }]);
      await expectExitCode(graph.syncConflictList, {}, 0);
    });

    test('syncConflictResolve should resolve', async () => {
      await expectExitCode(graph.syncConflictResolve, { id: 'c1', strategy: 'local-win' }, 0);
      expect(repo.resolveConflict).toHaveBeenCalledWith('c1', 'local-win');
    });
  });

  describe('graphQueryFederated', () => {
    test('should print federated query results', async () => {
      repo.queryFederatedGraph.mockResolvedValue({
        nodes: Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, source: 'ns' })),
        edges: [{ id: 'e1' }]
      });
      await expectExitCode(graph.graphQueryFederated, { globalId: 'g1' }, 0);
    });

    test('should print empty results', async () => {
      await expectExitCode(graph.graphQueryFederated, { globalId: 'g1', depth: 2 }, 0);
    });
  });

  describe('knowledge evolution/patterns/strategy/snapshot', () => {
    test('knowledgeEvolution should print growth', async () => {
      repo.analyzeEvolution.mockResolvedValue({
        growth: { newResources: 1, newRelations: 2, rate: 0.5 },
        velocity: { value: 3, type: 'balanced' },
        entropy: { normalized: 0.4, interpretation: 'moderate', typeCount: 3 },
        trend: { direction: 'accelerating' }
      });
      await expectExitCode(graph.knowledgeEvolution, {}, 0);
    });

    test('knowledgePatterns should print patterns', async () => {
      repo.detectKnowledgePatterns.mockResolvedValue({
        hubs: [{ rid: 'h1', degree: 3, incoming: 1, outgoing: 2 }],
        chains: [{ length: 3, description: 'chain' }],
        bridges: [{ rid: 'b1', description: 'bridge' }],
        deadEnds: [{ rid: 'd1', incoming: 1 }]
      });
      await expectExitCode(graph.knowledgePatterns, {}, 0);
    });

    test('knowledgePatterns should print no hubs', async () => {
      await expectExitCode(graph.knowledgePatterns, {}, 0);
    });

    test('knowledgeStrategy should print actions', async () => {
      repo.generateKnowledgeStrategy.mockResolvedValue([
        { action: 'connect', priority: 'high', reason: 'r', suggestion: 's' },
        { action: 'unknown', priority: 'low', reason: 'r2' }
      ]);
      await expectExitCode(graph.knowledgeStrategy, {}, 0);
    });

    test('knowledgeStrategy should print balanced message', async () => {
      await expectExitCode(graph.knowledgeStrategy, {}, 0);
    });

    test('knowledgeSnapshot should create a snapshot', async () => {
      await expectExitCode(graph.knowledgeSnapshot, {}, 0);
    });
  });

  describe('plugins', () => {
    test('pluginList should print empty state', async () => {
      await expectExitCode(graph.pluginList, {}, 0);
    });

    test('pluginList should print plugins', async () => {
      repo.listPlugins.mockResolvedValue([{ id: 'p', name: 'Name', version: '1.0.0', state: 'enabled' }]);
      await expectExitCode(graph.pluginList, {}, 0);
    });

    test('pluginEnable should enable', async () => {
      await expectExitCode(graph.pluginEnable, { id: 'p' }, 0);
    });

    test('pluginDisable should disable', async () => {
      await expectExitCode(graph.pluginDisable, { id: 'p' }, 0);
    });

    test('pluginReload should reload', async () => {
      await expectExitCode(graph.pluginReload, { id: 'p' }, 0);
    });

    test('pluginInfo should print not found', async () => {
      await expectExitCode(graph.pluginInfo, { id: 'missing' }, 0);
    });

    test('pluginInfo should print plugin details', async () => {
      const plugin = {
        name: 'Name', id: 'p', state: 'enabled',
        manifest: () => ({ version: '1.0.0', dependencies: ['a'], config: { k: { type: 'string', default: 'x', description: 'd' } }, contributes: { importer: ['i1'] } })
      };
      repo.getPluginManager.mockReturnValue({ getPlugin: () => plugin });
      repo.getPluginExtensionRegistry.mockReturnValue({
        types: () => ['importers'],
        list: () => [{ key: 'i1', pluginId: 'p' }]
      });
      repo.getPluginHookManager.mockReturnValue({ hookNames: () => ['beforeSearch'], listenerCount: () => 1 });
      repo.getPluginConfig.mockResolvedValue({ k: 'x' });
      await expectExitCode(graph.pluginInfo, { id: 'p' }, 0);
    });

    test('pluginDiscover should list providers when no provider given', async () => {
      repo.getDiscoveryService().listProviders.mockReturnValue([{ key: 'fs', pluginId: 'p' }]);
      await expectExitCode(graph.pluginDiscover, {}, 0);
    });

    test('pluginDiscover should print empty providers', async () => {
      await expectExitCode(graph.pluginDiscover, {}, 0);
    });

    test('pluginDiscover should run discovery', async () => {
      repo.getDiscoveryService().discover.mockResolvedValue({
        candidates: [{ path: '/x' }], resources: [{}], relations: [], skipped: [{}], errors: [{ error: 'e' }]
      });
      await expectExitCode(graph.pluginDiscover, { provider: 'fs', source: '.', dryRun: true }, 0);
    });

    test('pluginInstall should install', async () => {
      await expectExitCode(graph.pluginInstall, { id: 'p' }, 0);
    });

    test('pluginUninstall should uninstall with delete', async () => {
      await expectExitCode(graph.pluginUninstall, { id: 'p', delete: true }, 0);
    });

    test('pluginUninstall should uninstall keeping files', async () => {
      await expectExitCode(graph.pluginUninstall, { id: 'p' }, 0);
    });

    test('pluginConfig should print all config', async () => {
      const plugin = { name: 'Name', manifest: () => ({ config: { k: { type: 'string', default: 'x', description: 'd' } } }) };
      repo.getPluginManager.mockReturnValue({ getPlugin: () => plugin });
      repo.getPluginConfig.mockResolvedValue({ k: 'x' });
      await expectExitCode(graph.pluginConfig, { id: 'p' }, 0);
    });

    test('pluginConfig should error when plugin missing', async () => {
      await expectExitCode(graph.pluginConfig, { id: 'missing' }, 1);
    });

    test('pluginConfig should print a single key', async () => {
      const plugin = { name: 'Name', manifest: () => ({ config: { k: { description: 'd' } } }) };
      repo.getPluginManager.mockReturnValue({ getPlugin: () => plugin });
      repo.getPluginConfig.mockResolvedValue({ k: 'x' });
      await expectExitCode(graph.pluginConfig, { id: 'p', key: 'k' }, 0);
    });

    test('pluginConfig should error for undeclared key', async () => {
      const plugin = { name: 'Name', manifest: () => ({ config: { k: {} } }) };
      repo.getPluginManager.mockReturnValue({ getPlugin: () => plugin });
      await expectExitCode(graph.pluginConfig, { id: 'p', key: 'nope' }, 1);
    });

    test('pluginConfig should set a value', async () => {
      const plugin = { name: 'Name', manifest: () => ({ config: { k: {} } }) };
      repo.getPluginManager.mockReturnValue({ getPlugin: () => plugin });
      repo.getPluginConfig.mockResolvedValue({ k: 'new' });
      await expectExitCode(graph.pluginConfig, { id: 'p', key: 'k', value: 'new' }, 0);
      expect(repo.setPluginConfig).toHaveBeenCalledWith('p', 'k', 'new');
    });

    test('pluginWatch should list providers when no provider given', async () => {
      repo.getDiscoveryService().listProviders.mockReturnValue([{ key: 'fs', pluginId: 'p', provider: { watch: () => {} } }]);
      await expectExitCode(graph.pluginWatch, {}, 0);
    });

    test('pluginWatch should start watching', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await graph.pluginWatch({ provider: 'fs', source: '.' });
      expect(repo.getDiscoveryService().watch).toHaveBeenCalledWith('fs', '.');
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      expect(exitSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    test('pluginSearch should print empty registry', async () => {
      fetchRegistry.mockResolvedValue([]);
      await expectExitCode(graph.pluginSearch, {}, 0);
    });

    test('pluginSearch should filter by keyword', async () => {
      fetchRegistry.mockResolvedValue([
        { id: 'alpha', name: 'Alpha', version: '1.0.0', description: 'desc' },
        { id: 'beta', name: 'Beta', version: '2.0.0', description: 'other' }
      ]);
      await expectExitCode(graph.pluginSearch, { keyword: 'alpha' }, 0);
    });

    test('pluginSearch should print all plugins without keyword', async () => {
      fetchRegistry.mockResolvedValue([{ id: 'alpha', name: 'Alpha', version: '1.0.0', description: 'desc' }]);
      await expectExitCode(graph.pluginSearch, {}, 0);
    });

    test('pluginSearch should print no matches', async () => {
      fetchRegistry.mockResolvedValue([{ id: 'alpha', name: 'Alpha', version: '1.0.0' }]);
      await expectExitCode(graph.pluginSearch, { keyword: 'zzz' }, 0);
    });

    test('pluginSearch should report failure on error', async () => {
      fetchRegistry.mockRejectedValue(new Error('network'));
      await expectExitCode(graph.pluginSearch, {}, 1);
    });

    test('pluginUpdate should print up to date', async () => {
      await expectExitCode(graph.pluginUpdate, { id: 'p' }, 0);
    });

    test('pluginUpdate should print updated', async () => {
      repo.updatePlugin.mockResolvedValue({ upToDate: false, currentVersion: '1', newVersion: '2' });
      await expectExitCode(graph.pluginUpdate, { id: 'p' }, 0);
    });
  });

  describe('events', () => {
    test('eventList should print empty state', async () => {
      await expectExitCode(graph.eventList, {}, 0);
    });

    test('eventList should print events', async () => {
      repo.getEventHistory.mockResolvedValue([{ id: 'evt_1', type: 'resource.created', source: 'cli', createdAt: Date.now() }]);
      await expectExitCode(graph.eventList, { limit: 5, type: 'a', source: 'b' }, 0);
    });

    test('eventHistory should print stats', async () => {
      repo.getEventStats.mockResolvedValue([{ type: 'a', count: 2 }]);
      await expectExitCode(graph.eventHistory, {}, 0);
    });

    test('eventListeners should list types without a type arg', async () => {
      repo.getRegisteredEventTypes.mockResolvedValue(['a.b']);
      repo.getEventListeners.mockResolvedValue(2);
      await expectExitCode(graph.eventListeners, {}, 0);
    });

    test('eventListeners should print count for a type', async () => {
      await expectExitCode(graph.eventListeners, { type: 'a.b' }, 0);
    });

    test('eventReplay should replay all events', async () => {
      repo.replayEvents.mockResolvedValue([{ type: 'a', createdAt: Date.now() }]);
      await expectExitCode(graph.eventReplay, {}, 0);
    });

    test('eventReplay should replay from a specific event', async () => {
      EventStore.mockImplementation(() => ({ get: jest.fn().mockResolvedValue({ createdAt: 123 }) }));
      repo.replayEvents.mockResolvedValue([]);
      await expectExitCode(graph.eventReplay, { id: 'evt_1' }, 0);
    });

    test('eventReplay should error when the event is missing', async () => {
      await expectExitCode(graph.eventReplay, { id: 'evt_missing' }, 1);
    });
  });

  describe('workflow', () => {
    test('workflowList should print empty state', async () => {
      await expectExitCode(graph.workflowList, {}, 0);
    });

    test('workflowList should print workflows', async () => {
      repo.listWorkflows.mockResolvedValue([
        { id: 'wf1', name: 'Review', version: 1, stateCount: 2, transitionCount: 1, status: 'active', description: 'd', applicableSchemas: ['note'] }
      ]);
      await expectExitCode(graph.workflowList, {}, 0);
    });

    test('workflowShow should print not found', async () => {
      await expectExitCode(graph.workflowShow, { id: 'wf1' }, 0);
    });

    test('workflowShow should print details', async () => {
      repo.getWorkflow.mockResolvedValue({
        id: 'wf1', name: 'Review', description: 'd', version: 1, status: 'active',
        applicableSchemas: ['note'],
        states: [{ id: 'draft', name: 'Draft', description: 'x' }],
        transitions: [{ from: 'draft', to: 'done', name: 'finish', rules: [{ r: 1 }] }]
      });
      await expectExitCode(graph.workflowShow, { id: 'wf1' }, 0);
    });

    test('workflowVersions should print versions', async () => {
      repo.listWorkflowVersions.mockResolvedValue([{ version: 1, createdAt: Date.now() }]);
      await expectExitCode(graph.workflowVersions, { id: 'wf1' }, 0);
    });

    test('workflowVersions should print a frozen snapshot', async () => {
      repo.getWorkflowVersion.mockResolvedValue({ version: 1, states: [] });
      await expectExitCode(graph.workflowVersions, { id: 'wf1', version: 1 }, 0);
    });

    test('workflowVersions should handle missing snapshot', async () => {
      await expectExitCode(graph.workflowVersions, { id: 'wf1', version: 9 }, 0);
    });

    test('workflowCreate should create from argv', async () => {
      await expectExitCode(graph.workflowCreate, { id: 'wf1', states: [] }, 1);
    });

    test('workflowCreate should create from a file', async () => {
      const defFile = path.join(require('os').tmpdir(), `wf-${Date.now()}.json`);
      require('fs-extra').writeFileSync(defFile, JSON.stringify({ states: [{ id: 'a' }], transitions: [{ from: 'a', to: 'b' }] }));
      await expectExitCode(graph.workflowCreate, { id: 'wf1', file: defFile }, 0);
      require('fs-extra').removeSync(defFile);
    });

    test('workflowUpdate should update', async () => {
      await expectExitCode(graph.workflowUpdate, { id: 'wf1', name: 'New' }, 0);
      expect(repo.updateWorkflow).toHaveBeenCalledWith('wf1', { name: 'New' });
    });

    test('workflowUpdate should error without patch', async () => {
      await expectExitCode(graph.workflowUpdate, { id: 'wf1' }, 1);
    });

    test('workflowRemove should remove', async () => {
      await expectExitCode(graph.workflowRemove, { id: 'wf1' }, 0);
    });

    test('workflowRemove should purge', async () => {
      await expectExitCode(graph.workflowRemove, { id: 'wf1', purge: true }, 0);
    });

    test('workflowAttach should attach', async () => {
      await expectExitCode(graph.workflowAttach, { rid: 'r', wfid: 'wf' }, 0);
      expect(repo.attachWorkflow).toHaveBeenCalledWith('r', 'wf', { initialState: undefined, actor: 'cli' });
    });

    test('workflowDetach should detach', async () => {
      await expectExitCode(graph.workflowDetach, { instanceId: 'i1' }, 0);
    });

    test('workflowDetach should print not found', async () => {
      repo.detachWorkflow.mockResolvedValue(false);
      await expectExitCode(graph.workflowDetach, { instanceId: 'i1' }, 0);
    });

    test('workflowResume should resume', async () => {
      await expectExitCode(graph.workflowResume, { instanceId: 'i1' }, 0);
    });

    test('workflowTransition should transition', async () => {
      await expectExitCode(graph.workflowTransition, { rid: 'r', wfid: 'wf', to: 'done' }, 0);
    });

    test('workflowTransition should parse metadata', async () => {
      await expectExitCode(graph.workflowTransition, { rid: 'r', wfid: 'wf', to: 'done', metadata: '{"a":1}' }, 0);
    });

    test('workflowCanTransition should print allowed', async () => {
      await expectExitCode(graph.workflowCanTransition, { rid: 'r', wfid: 'wf', to: 'done' }, 0);
    });

    test('workflowCanTransition should print denied and exit 1', async () => {
      repo.canTransitionWorkflow.mockResolvedValue({ allowed: false, reason: 'nope' });
      await expectExitCode(graph.workflowCanTransition, { rid: 'r', wfid: 'wf', to: 'done' }, 1);
    });

    test('workflowInstances should print empty state', async () => {
      await expectExitCode(graph.workflowInstances, {}, 0);
    });

    test('workflowInstances should print instances', async () => {
      repo.listWorkflowInstances.mockResolvedValue([
        { id: 'i1', workflowId: 'wf', currentState: 'draft', status: 'active', workflowVersion: 1, resourceRid: 'r' }
      ]);
      await expectExitCode(graph.workflowInstances, { wf: 'wf', rid: 'r' }, 0);
    });

    test('workflowHistory should print empty history', async () => {
      await expectExitCode(graph.workflowHistory, {}, 0);
    });

    test('workflowHistory should print history by id', async () => {
      repo.getWorkflowInstance.mockResolvedValue({ id: 'i1' });
      repo.getWorkflowHistory.mockResolvedValue([
        { fromState: 'draft', toState: 'done', workflowId: 'wf', actor: 'cli', created: Date.now() }
      ]);
      await expectExitCode(graph.workflowHistory, { id: 'i1' }, 0);
    });
  });

  describe('permissions', () => {
    test('permissionRoleList should print roles', async () => {
      repo.listRoles.mockResolvedValue([{ id: 'admin', name: 'Admin', permissionCount: 3, description: 'd' }]);
      await expectExitCode(graph.permissionRoleList, {}, 0);
    });

    test('permissionCheck should print allowed', async () => {
      await expectExitCode(graph.permissionCheck, { subject: 'u1', action: 'read', resource: 'r1' }, 0);
    });

    test('permissionAudit should print audit log', async () => {
      repo.getPermissionAudit.mockResolvedValue([{ subject: 'u1', action: 'read', allowed: true, createdAt: Date.now() }]);
      repo.getDeniedPermissionStats.mockResolvedValue([{ subject: 'u1', action: 'write', count: 3 }]);
      await expectExitCode(graph.permissionAudit, {}, 0);
    });

    test('permissionGrant should grant', async () => {
      await expectExitCode(graph.permissionGrant, { subject: 'u1', action: 'read' }, 0);
      expect(repo.grantPermission).toHaveBeenCalledWith('u1', 'read');
    });
  });

  describe('agents / teams', () => {
    test('agentList should print empty state', async () => {
      await expectExitCode(graph.agentList, {}, 0);
    });

    test('agentList should print agents', async () => {
      repo.listAgents.mockResolvedValue([
        { id: 'a1', type: 'analyst', capabilityCount: 2, status: 'initialized', description: 'd' }
      ]);
      await expectExitCode(graph.agentList, {}, 0);
    });

    test('agentInfo should print not found', async () => {
      await expectExitCode(graph.agentInfo, { id: 'missing' }, 0);
    });

    test('agentInfo should print agent details with memory', async () => {
      repo.listAgents.mockResolvedValue([{ id: 'a1', name: 'N', type: 'analyst', status: 'ready', capabilityCount: 2, description: 'd' }]);
      repo.getAgentMemory.mockResolvedValue([{ type: 'observation', createdAt: Date.now() }]);
      await expectExitCode(graph.agentInfo, { id: 'a1' }, 0);
    });

    test('agentRun should run successfully', async () => {
      await expectExitCode(graph.agentRun, { id: 'a1', goal: 'g' }, 0);
    });

    test('agentRun should print failure result', async () => {
      repo.executeAgent.mockResolvedValue({ agentId: 'a1', goal: 'g', plan: [], result: { success: false, error: 'e' } });
      await expectExitCode(graph.agentRun, { id: 'a1' }, 0);
    });

    test('agentMemory should print empty state', async () => {
      await expectExitCode(graph.agentMemory, { id: 'a1' }, 0);
    });

    test('agentMemory should print records', async () => {
      repo.getAgentMemory.mockResolvedValue([
        { type: 'observation', createdAt: Date.now(), content: 'note' }
      ]);
      await expectExitCode(graph.agentMemory, { id: 'a1' }, 0);
    });

    test('teamList should print empty state', async () => {
      await expectExitCode(graph.teamList, {}, 0);
    });

    test('teamList should print teams', async () => {
      repo.listAgentTeams.mockResolvedValue([{ id: 't1', strategy: 'sequential', memberCount: 3 }]);
      await expectExitCode(graph.teamList, {}, 0);
    });

    test('teamRun should run', async () => {
      await expectExitCode(graph.teamRun, { id: 't1', goal: 'g' }, 0);
    });

    test('agentMessages should print messages', async () => {
      repo.getAgentMessages.mockResolvedValue([{ type: 'request', from: 'a', to: 'b', createdAt: Date.now() }]);
      await expectExitCode(graph.agentMessages, { agentId: 'a1' }, 0);
    });

    test('agentSend should send', async () => {
      await expectExitCode(graph.agentSend, { from: 'a', to: 'b', message: 'hi' }, 0);
      expect(repo.sendAgentMessage).toHaveBeenCalledWith('a', 'b', 'request', { text: 'hi' });
    });
  });

  describe('ai', () => {
    test('aiStatus should print status', async () => {
      repo.getAIStatus.mockResolvedValue({
        running: true,
        memory: { entryCount: 3, byType: { obs: 2 } },
        concepts: { conceptCount: 1, avgConfidence: 0.8 },
        learning: { totalRecords: 5 }
      });
      await expectExitCode(graph.aiStatus, {}, 0);
    });

    test('aiAsk should ask', async () => {
      repo.askAI.mockResolvedValue({
        confidence: 0.9, content: 'answer',
        reasoning: { thoughts: [{ step: 1, content: 'think' }] },
        actions: [{ status: 'completed', action: 'do', target: 'x' }]
      });
      await expectExitCode(graph.aiAsk, { question: 'q' }, 0);
    });

    test('aiAnalyze should analyze', async () => {
      repo.analyzeKnowledge.mockResolvedValue({ content: 'x', confidence: 0.5, actions: [{ action: 'a', status: 'done' }] });
      await expectExitCode(graph.aiAnalyze, {}, 0);
    });

    test('aiInsights should print empty state', async () => {
      await expectExitCode(graph.aiInsights, {}, 0);
    });

    test('aiInsights should print insights', async () => {
      repo.getAIInsights.mockResolvedValue([{ type: 'gap', content: 'x' }]);
      await expectExitCode(graph.aiInsights, {}, 0);
    });

    test('aiMemory should print memory', async () => {
      repo.getAIStatus.mockResolvedValue({
        memory: { entryCount: 2, byType: { obs: 1 } },
        concepts: { conceptCount: 1 }
      });
      await expectExitCode(graph.aiMemory, {}, 0);
    });
  });

  describe('evolution', () => {
    test('evoStatus should print status with issues', async () => {
      repo.getEvolutionStatus.mockResolvedValue({
        state: { version: 1, maturity: 'm', connectivity: 1, complexity: 1, score: 1 },
        health: { healthScore: 80, issues: [{ severity: 'high', type: 't', description: 'd' }], recommendations: [{ action: 'a', target: 't' }] },
        memory: { totalEvolutions: 2, improvementRate: 10 }
      });
      await expectExitCode(graph.evoStatus, {}, 0);
    });

    test('evoAnalyze should print diagnosis', async () => {
      repo._getEvolutionEngine().diagnose.mockResolvedValue({
        state: { health: 'ok', connectivity: 1, maturity: 'm' },
        health: { issues: [{ type: 't', description: 'd', severity: 'low' }] },
        opportunities: [{ type: 'o', priority: 'high' }],
        strategies: [{ type: 's', description: 'd', priority: 'low' }]
      });
      await expectExitCode(graph.evoAnalyze, {}, 0);
    });

    test('evoRun should print not needed', async () => {
      await expectExitCode(graph.evoRun, {}, 0);
    });

    test('evoRun should print evolution result', async () => {
      repo.executeEvolution.mockResolvedValue({
        evolved: true,
        validation: { improvement: 5 },
        before: { health: 80, score: 1 },
        after: { health: 85, score: 2 },
        results: [{ action: 'a', status: 'completed' }]
      });
      await expectExitCode(graph.evoRun, {}, 0);
    });

    test('evoHistory should print empty state', async () => {
      await expectExitCode(graph.evoHistory, {}, 0);
    });

    test('evoHistory should print history', async () => {
      repo.getEvolutionHistory.mockResolvedValue([{ id: 'e1', improvement: 2, createdAt: Date.now(), action: 'a' }]);
      await expectExitCode(graph.evoHistory, {}, 0);
    });
  });

  describe('admin', () => {
    test('should start the admin server', async () => {
      await graph.admin({ _: ['lo', 'admin'], port: 9000 });
      const serve = require('../../src/commands/serve.cjs');
      expect(serve).toHaveBeenCalledWith({ repo: process.cwd(), port: 9000, serveSpa: true });
    });
  });
});
