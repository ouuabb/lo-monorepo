/**
 * SessionService.js —— Agent 侧 Usage Session 运行时模型（U2）
 *
 * Session（U0 §3）：一次使用实例，纯运行时，不落库（Core 不持久化 Session）。
 *   openResource 经 resolveModes → 选择 Mode → resolveViewers → 创建 Session。
 * readOnly 三层（U0 §7）：Mode.writable → Session.state.readOnly → Permission（独立，未接线）。
 *   state.readOnly = !mode.rules.writable || overrides.has(rid)
 * overrides：Session 内（客户端内存）；新建 Session 时合并已存在的 override 集合。
 */

/**
 * 创建 Session
 * @param {{ rid: string, type?: string }} n — 资源信息（rid 必需；type 仅展示）
 * @param {object} api — preload loCore（modes.resolve / viewers.list）
 * @param {Set<string>} [globalOverrides] — App 级只读覆盖集合（已存在的 override 合并进 Session）
 * @returns {Promise<Session>}
 * Session = {
 *   resourceRid, modeId, viewerId, writable,
 *   state: { readOnly, dirty, scroll },
 *   overrides: Set<string>,
 * }
 */
export async function createSession(n, api, globalOverrides = new Set()) {
  const modesRes = await api.modes.resolve(n.rid);
  if (!modesRes || !modesRes.ok) {
    throw new Error((modesRes && modesRes.message) || '解析 Mode 失败');
  }
  if (!modesRes.modes || modesRes.modes.length === 0) {
    throw new Error(`资源 ${n.rid} 无可用的 Mode`);
  }
  const mode = modesRes.modes[0];
  const overrides = new Set(globalOverrides);

  const viewersRes = await api.viewers.list(mode.modeId);
  if (!viewersRes || !viewersRes.ok) {
    throw new Error((viewersRes && viewersRes.message) || '解析 Viewer 失败');
  }
  if (!viewersRes.viewers || viewersRes.viewers.length === 0) {
    throw new Error(`Mode ${mode.modeId} 无可用的 Viewer`);
  }
  const viewer = viewersRes.viewers[0];
  const writable = !!(mode.rules && mode.rules.writable);

  return {
    resourceRid: n.rid,
    modeId: mode.modeId,
    viewerId: viewer.viewerId,
    writable,
    state: {
      readOnly: !writable || overrides.has(n.rid),
      dirty: false,
      scroll: 0,
    },
    overrides,
  };
}

/**
 * 翻转资源的只读覆盖，返回 { nextSession, nextOverrides }
 * overrides 变化唯一来源是 toggle；readOnly 恒按
 *   state.readOnly = !writable || overrides.has(rid) 重算
 * （writable=false 的资源：覆盖翻转不影响 readOnly，恒只读）
 * @param {Session} session
 * @param {string} rid
 * @param {Set<string>} globalOverrides — App 级集合（变更后写回）
 */
export function toggleReadOnly(session, rid, globalOverrides) {
  const nextOverrides = new Set(globalOverrides);
  if (nextOverrides.has(rid)) {
    nextOverrides.delete(rid);
  } else {
    nextOverrides.add(rid);
  }
  const nextSession = {
    ...session,
    overrides: new Set(nextOverrides),
    state: {
      ...session.state,
      readOnly: !session.writable || nextOverrides.has(rid),
    },
  };
  return { nextSession, nextOverrides };
}

/**
 * 右键菜单只读判定：已打开 → 用 Session 事实；未打开 → 经 modes.resolve 取
 * mode.rules.writable（readOnly = !writable || overrides.has(rid)）
 * @param {{ rid: string }} n
 * @param {object} api
 * @param {Set<string>} globalOverrides
 * @param {Session|null} [existing] — 已打开 tab 的 Session（可用时优先）
 */
export async function resolveReadOnly(n, api, globalOverrides, existing = null) {
  if (existing && existing.resourceRid === n.rid) {
    return existing.state.readOnly;
  }
  if (!api || !api.modes || !api.modes.resolve) {
    return globalOverrides.has(n.rid);
  }
  let writable = false;
  try {
    const res = await api.modes.resolve(n.rid);
    if (res && res.ok && res.modes && res.modes.length > 0) {
      writable = !!(res.modes[0].rules && res.modes[0].rules.writable);
    }
  } catch {
    writable = false;
  }
  return !writable || globalOverrides.has(n.rid);
}
