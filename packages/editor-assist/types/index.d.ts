/**
 * @lo/editor-assist 类型声明（宿主集成参考）
 *
 * 本包为纯 CJS；类型仅供宿主（apps/agent renderer）消费时参考。
 */

/** 资源元信息（候选数据的最小形状） */
export interface ResourceMeta {
  rid: string;
  name: string;
  type?: string;
}

/** 宿主注入的数据源（依赖倒置：本包不感知 loCore/HTTP） */
export interface CandidateSource {
  /** 最近笔记（created DESC） */
  listRecent(limit: number): Promise<ResourceMeta[]>;
  /** 模糊搜索（如 lo Core /api/search） */
  search(query: string, limit: number): Promise<ResourceMeta[]>;
}

/** 触发检测结果 */
export interface WikilinkTrigger {
  active: true;
  /** `[[` 与光标之间已输入的查询文本（可为空串） */
  token: string;
  /** `[[` 起点（替换范围起点，文档偏移） */
  startOffset: number;
  /** 光标位置（替换范围终点） */
  endOffset: number;
}

/** 补全候选条目 */
export interface CompletionCandidate {
  /** 资源唯一身份（Wikilink identity） */
  rid: string;
  /** 展示名（resource.name；用于 UI 显示） */
  label: string;
  detail?: string;
  /** 插入文本：`[[rid]]`（rid-based；不插入 name） */
  insertText: string;
}

/** 候选编排结果 */
export interface CandidateResult {
  /** 替换范围（文档偏移，宿主转 Monaco Range） */
  range: { start: number; end: number };
  token: string;
  suggestions: CompletionCandidate[];
}

export function detectWikilinkTrigger(text: string, cursorOffset: number): WikilinkTrigger | null;
export function buildCandidates(opts: {
  text: string;
  cursorOffset: number;
  source: CandidateSource;
  limit?: number;
}): Promise<CandidateResult | null>;
