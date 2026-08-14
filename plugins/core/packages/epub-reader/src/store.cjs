/**
 * store — EPUB 阅读插件私有数据存储
 *
 * 设计依据：插件数据存储设计说明
 *
 * 核心原则：
 *   1. 插件运行状态（阅读状态/设置/高亮/书签）属于插件私有数据，
 *      由插件自行管理，不进入 lo 核心数据库。
 *   2. 用户知识资产（阅读笔记/批注）通过 lo Resource 体系保存，
 *      不停留在插件内部。
 *   3. 插件独立 SQLite 文件，与 lo 核心数据库隔离，
 *      插件卸载时可直接删除整个数据目录而不影响核心。
 *
 * 存储位置：
 *   <dataDir>/database.sqlite
 *   dataDir 默认为 lo 仓库的 .lo/plugins/epub-reader/
 *
 * 表结构：
 *   reading_state    — 阅读状态（位置/进度）
 *   reading_settings — 阅读设置（字体/主题/布局）
 *   highlight        — 高亮标注
 *   bookmark         — 书签
 *
 * 说明：
 *   resource_id 是字符串引用，指向 lo 中的 EPUB Resource rid，
 *   但不建立物理外键（Resource 在 lo 核心库，跨库无法外键）。
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * 创建存储实例
 *
 * createStore 同步返回 store 对象，db 在首次调用时懒加载初始化。
 * 所有数据方法为 async（SQLite I/O 异步）。
 *
 * @param {string} dataDir — 数据目录绝对路径
 */
function createStore(dataDir) {
  const dbPath = path.join(dataDir, 'database.sqlite');
  let db = null;
  let initPromise = null;

  /**
   * 懒加载初始化 db 并建表（幂等）
   * 多次调用返回同一个 Promise
   */
  function getDb() {
    if (!initPromise) {
      initPromise = new Promise((resolve, reject) => {
        // 确保数据目录存在
        fs.mkdirSync(dataDir, { recursive: true });
        db = new sqlite3.Database(dbPath, (err) => {
          if (err) return reject(err);
          // 启用 WAL 提升并发读写
          db.run('PRAGMA journal_mode = WAL', (e1) => {
            if (e1) return reject(e1);
            // 串行执行建表语句（幂等，IF NOT EXISTS）
            db.serialize(() => {
              db.run(`CREATE TABLE IF NOT EXISTS reading_state (
                resource_id  TEXT PRIMARY KEY,
                location     TEXT NOT NULL,
                progress     REAL NOT NULL,
                updated_at   TEXT NOT NULL
              )`);
              db.run(`CREATE TABLE IF NOT EXISTS reading_settings (
                resource_id  TEXT PRIMARY KEY,
                font_size    INTEGER,
                theme        TEXT,
                layout_mode  TEXT,
                updated_at   TEXT NOT NULL
              )`);
              db.run(`CREATE TABLE IF NOT EXISTS highlight (
                id           TEXT PRIMARY KEY,
                resource_id  TEXT NOT NULL,
                location     TEXT NOT NULL,
                text         TEXT NOT NULL,
                style        TEXT DEFAULT 'yellow',
                note         TEXT DEFAULT '',
                created_at   TEXT NOT NULL
              )`);
              db.run(`CREATE TABLE IF NOT EXISTS bookmark (
                id           TEXT PRIMARY KEY,
                resource_id  TEXT NOT NULL,
                location     TEXT NOT NULL,
                title        TEXT DEFAULT '',
                created_at   TEXT NOT NULL
              )`);
              db.run(`CREATE INDEX IF NOT EXISTS idx_highlight_rid
                      ON highlight(resource_id)`);
              db.run(`CREATE INDEX IF NOT EXISTS idx_bookmark_rid
                      ON bookmark(resource_id)`, () => resolve(db));
            });
          });
        });
      });
    }
    return initPromise;
  }

  /** 包装 db.run 为 Promise，返回 { lastID, changes } */
  async function run(sql, params = []) {
    const d = await getDb();
    return new Promise((resolve, reject) => {
      d.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /** 包装 db.get 为 Promise，返回单行或 undefined */
  async function get(sql, params = []) {
    const d = await getDb();
    return new Promise((resolve, reject) => {
      d.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /** 包装 db.all 为 Promise，返回行数组 */
  async function all(sql, params = []) {
    const d = await getDb();
    return new Promise((resolve, reject) => {
      d.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  function genId(prefix) {
    return prefix + '_' + crypto.randomBytes(6).toString('hex');
  }

  return {
    // ── 阅读状态（§2.1 阅读状态数据）──

    /**
     * 获取阅读状态
     * @returns {Promise<{location, progress, updatedAt}|null>}
     */
    async getReadingState(resourceId) {
      const row = await get(
        'SELECT location, progress, updated_at AS updatedAt FROM reading_state WHERE resource_id = ?',
        [resourceId]
      );
      return row || null;
    },

    /**
     * 保存阅读状态（UPSERT）
     * @param {string} resourceId — EPUB Resource rid
     * @param {string} location — 章节定位（CFI 格式，如 "epubcfi(0!/2:0,/2:0)"）
     * @param {number} progress — 阅读进度 0-1
     */
    async saveReadingState(resourceId, location, progress) {
      const updatedAt = new Date().toISOString();
      await run(
        `INSERT INTO reading_state (resource_id, location, progress, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(resource_id) DO UPDATE SET
           location = excluded.location,
           progress = excluded.progress,
           updated_at = excluded.updated_at`,
        [resourceId, location, progress, updatedAt]
      );
    },

    // ── 阅读设置（§3.2 阅读设置）──

    /**
     * 获取阅读设置
     * @returns {Promise<{fontSize, theme, layoutMode, updatedAt}|null>}
     */
    async getSettings(resourceId) {
      const row = await get(
        'SELECT font_size AS fontSize, theme, layout_mode AS layoutMode, updated_at AS updatedAt FROM reading_settings WHERE resource_id = ?',
        [resourceId]
      );
      return row || null;
    },

    /**
     * 保存阅读设置（UPSERT）
     * @param {string} resourceId
     * @param {object} settings — { fontSize?, theme?, layoutMode? }
     */
    async saveSettings(resourceId, settings = {}) {
      const updatedAt = new Date().toISOString();
      await run(
        `INSERT INTO reading_settings (resource_id, font_size, theme, layout_mode, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resource_id) DO UPDATE SET
           font_size = excluded.font_size,
           theme = excluded.theme,
           layout_mode = excluded.layout_mode,
           updated_at = excluded.updated_at`,
        [resourceId, settings.fontSize ?? null, settings.theme ?? null, settings.layoutMode ?? null, updatedAt]
      );
    },

    // ── 高亮（§5.1 阅读标记，默认为插件私有数据）──

    /**
     * 获取某 EPUB 的所有高亮
     * @returns {Promise<Array<{id, location, text, style, note, createdAt}>>}
     */
    async getHighlights(resourceId) {
      const rows = await all(
        `SELECT id, location, text, style, note, created_at AS createdAt
         FROM highlight WHERE resource_id = ? ORDER BY created_at ASC`,
        [resourceId]
      );
      return rows;
    },

    /**
     * 添加高亮
     * @param {string} resourceId
     * @param {{location, text, style?, note?}} highlight
     * @returns {Promise<object>} 已创建的高亮（含 id）
     */
    async addHighlight(resourceId, highlight) {
      const entry = {
        id: genId('hl'),
        location: highlight.location,
        text: highlight.text,
        style: highlight.style || 'yellow',
        note: highlight.note || '',
        createdAt: new Date().toISOString(),
      };
      await run(
        `INSERT INTO highlight (id, resource_id, location, text, style, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, resourceId, entry.location, entry.text, entry.style, entry.note, entry.createdAt]
      );
      return entry;
    },

    /**
     * 删除高亮
     * @returns {Promise<boolean>} 是否删除成功
     */
    async removeHighlight(resourceId, highlightId) {
      const result = await run(
        'DELETE FROM highlight WHERE id = ? AND resource_id = ?',
        [highlightId, resourceId]
      );
      return result.changes > 0;
    },

    // ── 书签（§5.1 阅读标记）──

    /**
     * 获取某 EPUB 的所有书签
     * @returns {Promise<Array<{id, location, title, createdAt}>>}
     */
    async getBookmarks(resourceId) {
      const rows = await all(
        `SELECT id, location, title, created_at AS createdAt
         FROM bookmark WHERE resource_id = ? ORDER BY created_at ASC`,
        [resourceId]
      );
      return rows;
    },

    /**
     * 添加书签
     * @param {string} resourceId
     * @param {{location, title?}} bookmark
     * @returns {Promise<object>} 已创建的书签（含 id）
     */
    async addBookmark(resourceId, bookmark) {
      const entry = {
        id: genId('bm'),
        location: bookmark.location,
        title: bookmark.title || '',
        createdAt: new Date().toISOString(),
      };
      await run(
        `INSERT INTO bookmark (id, resource_id, location, title, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [entry.id, resourceId, entry.location, entry.title, entry.createdAt]
      );
      return entry;
    },

    /**
     * 删除书签
     * @returns {Promise<boolean>} 是否删除成功
     */
    async removeBookmark(resourceId, bookmarkId) {
      const result = await run(
        'DELETE FROM bookmark WHERE id = ? AND resource_id = ?',
        [bookmarkId, resourceId]
      );
      return result.changes > 0;
    },

    // ── 生命周期 ──

    /** 数据库文件路径（测试/调试用） */
    _dbPath: dbPath,

    /** 关闭数据库连接（插件卸载/测试清理时调用） */
    async close() {
      if (!db) return;
      await new Promise((resolve, reject) => {
        db.close((err) => (err ? reject(err) : resolve()));
      });
      db = null;
      initPromise = null;
    },

    /** 删除整个数据库文件（测试用） */
    async _destroy() {
      await this.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      // 清理 WAL/SHM 文件
      for (const suffix of ['-wal', '-shm']) {
        const f = dbPath + suffix;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    },
  };
}

module.exports = { createStore };
