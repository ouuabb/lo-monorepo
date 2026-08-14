const path = require('path');
const Database = require('../../src/repo/database.cjs');
const TeamRegistry = require('../../src/collaboration/teamRegistry.cjs');
const MessageBus = require('../../src/collaboration/messageBus.cjs');
const SharedMemory = require('../../src/collaboration/sharedMemory.cjs');
const CollaborationMemory = require('../../src/collaboration/collaborationMemory.cjs');
const CollaborationEngine = require('../../src/collaboration/collaborationEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('CollaborationEngine', () => {
  let tempDir, db, sharedMemory, memory, registry, eventBus, agentEngine, engine;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    sharedMemory = new SharedMemory(db);
    memory = new CollaborationMemory(db);
    registry = new TeamRegistry();
    eventBus = { emit: jest.fn().mockResolvedValue(undefined) };
    agentEngine = { execute: jest.fn().mockResolvedValue('done') };
    engine = new CollaborationEngine({
      teamRegistry: registry,
      messageBus: new MessageBus({ memory, eventBus }),
      sharedMemory,
      memory,
      agentEngine,
      eventBus
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('constructor should register builtin team', () => {
    const teams = engine.listTeams();
    expect(teams).toContainEqual({
      id: 'knowledge-research-team',
      name: '知识研究团队',
      memberCount: 2,
      strategy: 'pipeline'
    });
  });

  describe('teams', () => {
    test('createTeam should register, persist and emit event', async () => {
      const team = await engine.createTeam({ id: 'custom-team', name: 'Custom', members: ['a', 'b'], strategy: 'broadcast' });
      expect(team.id).toBe('custom-team');
      expect(engine.listTeams()).toContainEqual({ id: 'custom-team', name: 'Custom', memberCount: 2, strategy: 'broadcast' });
      const saved = await memory.listTeams();
      expect(saved).toContainEqual({ id: 'custom-team', name: 'Custom', strategy: 'broadcast' });
      expect(eventBus.emit).toHaveBeenCalledWith({ type: 'team.created', payload: { id: 'custom-team' } });
    });

    test('createTeam should support agentIds and includes', async () => {
      const byIds = await engine.createTeam({ id: 't-ids', name: 'Ids', agentIds: ['x', 'y'] });
      expect(byIds.members).toEqual(['x', 'y']);
      const byIncludes = await engine.createTeam({ id: 't-inc', name: 'Inc', includes: ['z'] });
      expect(byIncludes.members).toEqual(['z']);
    });

    test('createTeam should default members and strategy', async () => {
      const team = await engine.createTeam({ id: 't-default', name: 'D' });
      expect(team.members).toEqual([]);
      expect(team.strategy).toBe('pipeline');
    });

    test('createTeam should throw when id already registered', async () => {
      await expect(engine.createTeam({ id: 'knowledge-research-team', name: 'X' })).rejects.toThrow(
        "Team 'knowledge-research-team' is already registered"
      );
    });

    test('createTeam should tolerate event emit failure', async () => {
      const throwingBus = { emit: jest.fn(() => { throw new Error('emit fail'); }) };
      const local = new CollaborationEngine({
        teamRegistry: new TeamRegistry(),
        messageBus: new MessageBus(),
        sharedMemory,
        memory,
        eventBus: throwingBus
      });
      const team = await local.createTeam({ id: 'emit-team', name: 'T', members: ['a'] });
      expect(team.id).toBe('emit-team');
    });
  });

  describe('messages', () => {
    test('sendMessage should create, deliver and persist a message', async () => {
      const msg = await engine.sendMessage('a', 'b', 'request', { x: 1 });
      expect(msg.from).toBe('a');
      expect(msg.to).toBe('b');
      expect(msg.type).toBe('request');
      const rows = await engine.getMessages('b');
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toEqual({ x: 1 });
    });

    test('getMessages should pass through limit', async () => {
      await engine.sendMessage('a', 'b', 'request', { i: 1 });
      await engine.sendMessage('a', 'b', 'request', { i: 2 });
      const rows = await engine.getMessages('b', 1);
      expect(rows).toHaveLength(1);
    });
  });

  describe('tasks', () => {
    test('createTask should throw for missing team', async () => {
      await expect(engine.createTask('ghost', 'g')).rejects.toThrow("Team 'ghost' not found");
    });

    test('createTask should plan, cache, persist and emit event', async () => {
      const task = await engine.createTask('knowledge-research-team', 'knowledge research');
      expect(task.teamId).toBe('knowledge-research-team');
      expect(task.subtasks).toHaveLength(3);
      expect(engine.getTask(task.id)).toBe(task);
      const saved = await memory.listTasks('knowledge-research-team');
      expect(saved.some(t => t.id === task.id)).toBe(true);
      expect(eventBus.emit).toHaveBeenCalledWith({
        type: 'task.created',
        payload: { id: task.id, teamId: 'knowledge-research-team', goal: 'knowledge research' }
      });
    });

    test('createTask should tolerate event emit failure', async () => {
      const throwingBus = { emit: jest.fn(() => { throw new Error('emit fail'); }) };
      const local = new CollaborationEngine({
        teamRegistry: new TeamRegistry(),
        messageBus: new MessageBus(),
        sharedMemory,
        memory,
        eventBus: throwingBus
      });
      await local.createTeam({ id: 'local-team', name: 'T', members: ['a'] });
      const task = await local.createTask('local-team', 'do it');
      expect(task).toHaveProperty('id');
    });

    test('assignTask should throw for missing task', async () => {
      await expect(engine.assignTask('missing')).rejects.toThrow("Task 'missing' not found");
    });

    test('assignTask should throw for missing team', async () => {
      const fakeTask = { id: 'orphan', teamId: 'ghost', status: 'created', subtasks: [] };
      engine._tasks.set('orphan', fakeTask);
      await expect(engine.assignTask('orphan')).rejects.toThrow("Team 'ghost' not found");
    });

    test('assignTask should dispatch to team members', async () => {
      const task = await engine.createTask('knowledge-research-team', 'knowledge research');
      const assigned = await engine.assignTask(task.id);
      expect(assigned.status).toBe('assigned');
      expect(task.subtasks[0].assignedAgent).toBe('research-agent');
    });

    test('getTasks should return task summaries', async () => {
      expect(engine.getTasks()).toEqual([]);
      const task = await engine.createTask('knowledge-research-team', 'knowledge research');
      const tasks = engine.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
    });
  });

  describe('executeTeam', () => {
    test('executeTeam should throw for missing team', async () => {
      await expect(engine.executeTeam('ghost', 'g')).rejects.toThrow("Team 'ghost' not found");
    });

    test('executeTeam should run agents and complete', async () => {
      await engine.createTeam({ id: 'exec-team', name: 'E', members: ['a', 'b'], strategy: 'pipeline' });
      const result = await engine.executeTeam('exec-team', 'do stuff');
      expect(result.status).toBe('completed');
      expect(result.result.completed).toBe(1);
      expect(agentEngine.execute).toHaveBeenCalledWith('a', { goal: 'do stuff' });
      const shared = await sharedMemory.read({ scope: 'team:exec-team', type: 'result' });
      expect(shared).toHaveLength(1);
      expect(shared[0].content).toEqual({ agentId: 'a', goal: 'do stuff', result: 'done' });
      expect(eventBus.emit).toHaveBeenCalledWith({
        type: 'task.assigned',
        payload: { taskId: expect.any(String), agentId: 'a', goal: 'do stuff' }
      });
      expect(eventBus.emit).toHaveBeenCalledWith({
        type: 'task.completed',
        payload: { taskId: expect.any(String), status: 'completed' }
      });
      expect(eventBus.emit).toHaveBeenCalledWith({
        type: 'collaboration.completed',
        payload: { teamId: 'exec-team', goal: 'do stuff', status: 'completed' }
      });
    });

    test('executeTeam without agentEngine should mark assigned', async () => {
      const local = new CollaborationEngine({
        teamRegistry: new TeamRegistry(),
        messageBus: new MessageBus(),
        sharedMemory,
        memory
      });
      await local.createTeam({ id: 'no-engine', name: 'N', members: ['a'], strategy: 'pipeline' });
      const result = await local.executeTeam('no-engine', 'solo task');
      expect(result.status).toBe('failed');
      expect(result.result.completed).toBe(0);
      expect(result.result.results[0].data).toEqual({ note: 'assigned (no agent engine)' });
    });

    test('executeTeam should mark failed when agent throws', async () => {
      const failingAgent = { execute: jest.fn().mockRejectedValue(new Error('agent exploded')) };
      const local = new CollaborationEngine({
        teamRegistry: new TeamRegistry(),
        messageBus: new MessageBus(),
        sharedMemory,
        memory,
        agentEngine: failingAgent
      });
      await local.createTeam({ id: 'fail-team', name: 'F', members: ['a'], strategy: 'pipeline' });
      const result = await local.executeTeam('fail-team', 'risky task');
      expect(result.status).toBe('failed');
      expect(result.result.completed).toBe(0);
      expect(result.result.results[0].data).toEqual({ error: 'agent exploded' });
      expect(failingAgent.execute).toHaveBeenCalled();
    });

    test('executeTeam should tolerate event emit failures', async () => {
      const throwingBus = {
        emit: jest.fn(evt => {
          if (evt.type === 'team.created') return Promise.resolve();
          return Promise.reject(new Error('emit fail'));
        })
      };
      const local = new CollaborationEngine({
        teamRegistry: new TeamRegistry(),
        messageBus: new MessageBus(),
        sharedMemory,
        memory,
        agentEngine,
        eventBus: throwingBus
      });
      await local.createTeam({ id: 'emit-exec', name: 'T', members: ['a'], strategy: 'pipeline' });
      const result = await local.executeTeam('emit-exec', 'g');
      expect(result.status).toBe('completed');
    });
  });

  describe('shared memory', () => {
    test('writeSharedMemory and getSharedMemory should round-trip', async () => {
      await engine.writeSharedMemory('team:x', 'result', { n: 1 });
      const rows = await engine.getSharedMemory('team:x', 'result');
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toEqual({ n: 1 });
    });
  });

  describe('triggerByEvent', () => {
    test('triggerByEvent should execute broadcast teams only', async () => {
      await engine.createTeam({ id: 'broadcast-team', name: 'B', members: ['a'], strategy: 'broadcast' });
      await engine.triggerByEvent('resource.created', { rid: 'r1' });
      const tasks = engine.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].teamId).toBe('broadcast-team');
      expect(tasks[0].goal).toBe('handle_resource.created');
    });

    test('triggerByEvent should log execution failures', async () => {
      const err = console.error;
      console.error = jest.fn();
      try {
        const local = new CollaborationEngine({
          teamRegistry: new TeamRegistry(),
          messageBus: new MessageBus(),
          sharedMemory,
          memory
        });
        await local.createTeam({ id: 'bc', name: 'B', members: [], strategy: 'broadcast' });
        await local.triggerByEvent('evt', {});
      } finally {
        console.error = err;
      }
    });
  });
});
