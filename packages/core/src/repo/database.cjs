const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const { runMigrations } = require('./migrationRunner.cjs');

class Database {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.dbPath = path.join(repoPath, '.repo', 'database.sqlite');
    this.db = null;
  }

  async open() {
    const repoDir = path.join(this.repoPath, '.repo');
    if (!(await fs.pathExists(repoDir))) {
      throw new Error(`此目录不是 lo 仓库（缺少 .repo）。请先执行 lo init 初始化。`);
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // 启用外键约束
          this.db.run('PRAGMA foreign_keys = ON', (err2) => {
            if (err2) return reject(err2);
            // 启用 WAL 模式：支持并发读写，防数据库损坏
            this.db.run('PRAGMA journal_mode = WAL', (err3) => {
              if (err3) return reject(err3);
              // 并发写等待而非立即失败（避免 SQLITE_BUSY）
              this.db.run('PRAGMA busy_timeout = 5000', (err4) => {
                if (err4) return reject(err4);
                resolve(this);
              });
            });
          });
        }
      });
    });
  }

  async init() {
    await this.open();
    // 通过迁移系统初始化表结构（仅执行未运行过的迁移）
    await runMigrations(this, path.join(__dirname, 'migrations'));
    return this;
  }

  // 执行单条带参数 SQL，返回 { lastID, changes }
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // 执行多条 SQL（不支持参数），无返回值
  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 查询单行
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 查询多行
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = Database;
