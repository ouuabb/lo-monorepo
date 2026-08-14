const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const Logger = require("./logger.cjs");

/**
 * 远程同步传输层
 *
 * 负责：
 *   1. 将操作日志 + 资源文件打包为同步批次
 *   2. 通过 SCP 推送/拉取批次
 *   3. 批次完整性校验
 */

/**
 * 递归列出目录下的所有文件（绝对路径）
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function _listFiles(dir) {
  const out = [];
  const walk = async (cur) => {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        await walk(p);
      } else {
        out.push(p);
      }
    }
  };
  await walk(dir);
  return out;
}

class SyncRemote {
  /**
   * 获取远程同步清单（记录远程已接收的全部 op_id）
   * 清单不存在时返回 null，表示需要全量推送
   *
   * @param {object} parsed - 已解析的远程地址
   * @returns {Promise<Set<string>|null>} 远程已接收的 op_id 集合，null 表示无清单
   */
  async fetchRemoteManifest(parsed) {
    const manifestPath = `${parsed.remotePath}/sync_batches/sync_manifest.json`;

    if (parsed.isLocal) {
      try {
        const content = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        return new Set(manifest.op_ids || []);
      } catch {
        return null;
      }
    }

    // 远程同步：SSH cat 清单文件
    const sshTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}`;
    try {
      const stdout = execFileSync("ssh", [sshTarget, "cat", manifestPath], {
        stdio: "pipe",
        timeout: 10000,
      })
        .toString()
        .trim();

      if (!stdout) return null;
      const manifest = JSON.parse(stdout);
      return new Set(manifest.op_ids || []);
    } catch {
      return null;
    }
  }

  /**
   * 推送同步清单到远程
   *
   * @param {Set<string>} opIds - 远程应记录的 op_id 全集
   * @param {object} parsed - 已解析的远程地址
   */
  async pushRemoteManifest(opIds, parsed) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-manifest-"));
    const localPath = path.join(tempDir, "sync_manifest.json");
    const manifest = { version: 1, op_ids: [...opIds] };
    await fs.writeFile(localPath, JSON.stringify(manifest));

    const remotePath = `${parsed.remotePath}/sync_batches/sync_manifest.json`;

    try {
      if (parsed.isLocal) {
        await fs.copyFile(localPath, remotePath);
      } else {
        const sshTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}`;
        execFileSync("scp", ["-q", localPath, `${sshTarget}:${remotePath}`], {
          stdio: "pipe",
          timeout: 30000,
        });
      }
    } finally {
      await this.cleanup(tempDir);
    }
  }

  /**
   * @param {string} repoPath - 仓库根路径
   */
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  /**
   * 解析远程地址
   * 格式: user@host:/path 或 /local/path
   * @param {string} remote
   * @returns {{ user: string|null, host: string|null, remotePath: string, isLocal: boolean }}
   */
  parseRemote(remote) {
    // Windows 绝对路径 (C:\... 或 \\...)
    if (path.isAbsolute(remote) || /^[a-zA-Z]:\\/.test(remote)) {
      return { user: null, host: null, remotePath: remote, isLocal: true };
    }

    // Unix 绝对路径 (/path/to/repo)
    if (/^[~/]/.test(remote)) {
      return { user: null, host: null, remotePath: remote, isLocal: true };
    }

    // SCP 格式: user@host:/path
    const match = remote.match(/^(?:([^@]+)@)?([^:]+):(.+)$/);
    if (match) {
      return {
        user: match[1] || null,
        host: match[2],
        remotePath: match[3],
        isLocal: false,
      };
    }

    throw new Error(
      `无效的远程地址: ${remote}。\n` +
        "  支持格式:\n" +
        "    user@host:/path    SSH 远程\n" +
        "    /absolute/path     绝对本地路径（Unix）\n" +
        "    C:\\path            绝对本地路径（Windows）\n" +
        "    别名                通过 lo remote add 配置的别名",
    );
  }

  /**
   * 打包同步批次
   *
   * 批次结构:
   *   tempdir/
   *     manifest.json          ← 批次清单（操作列表 + 元数据）
   *     ops.json               ← 操作日志条目数组
   *     checksums.json         ← 所有文件的 SHA-256 校验和
   *     resources/
   *       <relative_path>      ← 资源文件（保持原始加密状态）
   *
   * @param {Array} ops - 操作日志条目
   * @param {object} meta - 批次元数据 { device_id, timestamp, ... }
   * @returns {Promise<string>} 打包后的 tar.gz 文件路径
   */
  async packageBatch(ops, meta = {}) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-sync-batch-"));
    const batchDir = path.join(tempDir, "batch");
    await fs.ensureDir(batchDir);
    await fs.ensureDir(path.join(batchDir, "resources"));

    // 写入 ops.json
    await fs.writeFile(
      path.join(batchDir, "ops.json"),
      JSON.stringify(
        ops.map((op) => ({
          op_id: op.op_id,
          op_type: op.op_type,
          rid: op.rid,
          data: typeof op.data === "string" ? JSON.parse(op.data) : op.data,
          timestamp: op.timestamp,
          device_id: op.device_id,
        })),
        null,
        2,
      ),
    );

    // 收集所有涉及的资源文件
    const checksums = {};
    const resourcePaths = new Set();

    // 构建 relPath → op 的映射，用于后续还原完整路径
    const opByPath = new Map();
    for (const op of ops) {
      const data = typeof op.data === "string" ? JSON.parse(op.data) : op.data;

      switch (op.op_type) {
        case "resource_created":
        case "resource_updated":
          if (data.path) {
            resourcePaths.add(data.path);
            opByPath.set(data.path, op);
          }
          break;
      }
    }

    // 复制资源文件到批次目录
    const packEntry = async (src, dest, rel) => {
      const stat = await fs.stat(src);
      if (stat.isDirectory()) {
        await fs.copy(src, dest);
        const files = await _listFiles(dest);
        for (const f of files) {
          const inner = path.relative(dest, f).replace(/\\/g, "/");
          const content = await fs.readFile(f);
          checksums[path.posix.join(rel, inner)] = crypto
            .createHash("sha256")
            .update(content)
            .digest("hex");
        }
      } else {
        await fs.ensureDir(path.dirname(dest));
        await fs.copyFile(src, dest);
        const content = await fs.readFile(src);
        checksums[rel] = crypto
          .createHash("sha256")
          .update(content)
          .digest("hex");
      }
    };

    for (const relPath of resourcePaths) {
      const absPath = path.join(this.repoPath, relPath);
      // 批次内按仓库相对路径存储（保留子目录结构）
      const destPath = path.join(batchDir, "resources", relPath);

      if (await fs.pathExists(absPath)) {
        await packEntry(absPath, destPath, relPath);
      }
    }

    // 计算 ops.json 校验和
    const opsContent = await fs.readFile(path.join(batchDir, "ops.json"));
    checksums["ops.json"] = crypto
      .createHash("sha256")
      .update(opsContent)
      .digest("hex");

    // 写入 checksums.json
    await fs.writeFile(
      path.join(batchDir, "checksums.json"),
      JSON.stringify(checksums, null, 2),
    );

    // 写入 manifest.json
    const manifest = {
      version: 1,
      device_id: meta.device_id || "unknown",
      timestamp: meta.timestamp || Date.now(),
      op_count: ops.length,
      last_op_id: ops.length > 0 ? ops[ops.length - 1].op_id : null,
      last_op_timestamp: ops.length > 0 ? ops[ops.length - 1].timestamp : null,
      checksums,
    };

    await fs.writeFile(
      path.join(batchDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );

    // 打包为 gzipped tarball
    const tarPath = path.join(tempDir, "sync-batch.tar.gz");
    try {
      execFileSync("tar", ["-czf", tarPath, "-C", batchDir, "."], {
        stdio: "pipe",
        timeout: 60000,
      });
    } catch {
      // tar 不可用时使用简单的目录复制
      Logger.warn("tar 命令不可用，使用未压缩的目录格式");
      // 将整个 batchDir 作为批次目录使用
      await fs.remove(tarPath);
      return batchDir;
    }

    // 清理批次目录
    await fs.remove(batchDir);

    return tarPath;
  }

  /**
   * 解包同步批次并验证完整性
   *
   * @param {string} batchPath - tar.gz 文件路径 或 批次目录路径
   * @returns {Promise<{ manifest: object, ops: Array, resourceDir: string }>}
   */
  async unpackBatch(batchPath) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-sync-recv-"));
    let extractDir;

    const stat = await fs.stat(batchPath);
    if (stat.isDirectory()) {
      // 目录格式
      extractDir = batchPath;
    } else {
      // tar.gz 格式
      extractDir = tempDir;
      try {
        execFileSync("tar", ["-xzf", batchPath, "-C", extractDir], {
          stdio: "pipe",
          timeout: 60000,
        });
      } catch {
        throw new Error("无法解压同步批次。请确保 tar 命令可用。");
      }
    }

    // 读取 manifest
    const manifestPath = path.join(extractDir, "manifest.json");
    if (!(await fs.pathExists(manifestPath))) {
      throw new Error("同步批次损坏：缺少 manifest.json");
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

    // 读取 ops
    const opsPath = path.join(extractDir, "ops.json");
    if (!(await fs.pathExists(opsPath))) {
      throw new Error("同步批次损坏：缺少 ops.json");
    }
    const ops = JSON.parse(await fs.readFile(opsPath, "utf-8"));

    // 验证完整性
    await this._verifyBatch(extractDir, manifest, ops);

    const resourceDir = path.join(extractDir, "resources");

    return { manifest, ops, resourceDir, extractDir };
  }

  /**
   * 验证批次完整性
   */
  async _verifyBatch(extractDir, manifest, ops) {
    const expectedChecksums = manifest.checksums || {};
    const resourceDir = path.join(extractDir, "resources");

    const errors = [];

    // 验证 ops.json
    if (expectedChecksums["ops.json"]) {
      const opsContent = await fs.readFile(path.join(extractDir, "ops.json"));
      const actualHash = crypto
        .createHash("sha256")
        .update(opsContent)
        .digest("hex");
      if (actualHash !== expectedChecksums["ops.json"]) {
        errors.push("ops.json 校验和不匹配");
      }
    }

    // 验证资源文件
    for (const [relPath, expectedHash] of Object.entries(expectedChecksums)) {
      if (relPath === "ops.json") continue;

      const absPath = path.join(resourceDir, relPath);
      if (!(await fs.pathExists(absPath))) {
        errors.push(`缺少资源文件: ${relPath}`);
        continue;
      }

      const content = await fs.readFile(absPath);
      const actualHash = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex");
      if (actualHash !== expectedHash) {
        errors.push(`资源文件校验和不匹配: ${relPath}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`批次完整性验证失败:\n  ${errors.join("\n  ")}`);
    }
  }

  /**
   * 通过 SCP 推送批次文件到远程
   * @param {string} batchPath - tar.gz 文件路径
   * @param {string} remote - user@host:/path
   * @param {object} parsed - 已解析的远程地址
   */
  async pushBatch(batchPath, remote, parsed) {
    if (parsed.isLocal) {
      // 本地同步：直接复制
      await fs.ensureDir(path.join(parsed.remotePath, "sync_batches"));
      const dest = path.join(
        parsed.remotePath,
        "sync_batches",
        `batch_${Date.now()}.tar.gz`,
      );
      await fs.copyFile(batchPath, dest);
      return dest;
    }

    // 远程同步：SCP
    const remoteTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}:${parsed.remotePath}/sync_batches/`;

    // 确保远程目录存在
    const sshTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}`;
    try {
      execFileSync(
        "ssh",
        [sshTarget, "mkdir", "-p", `${parsed.remotePath}/sync_batches`],
        {
          stdio: "pipe",
          timeout: 10000,
        },
      );
    } catch (e) {
      throw new Error(`无法连接到远程主机: ${e.message}`);
    }

    // 复制批次文件
    const batchName = `batch_${Date.now()}.tar.gz`;
    try {
      execFileSync("scp", ["-q", batchPath, `${remoteTarget}${batchName}`], {
        stdio: "pipe",
        timeout: 300000,
      });
    } catch (e) {
      throw new Error(`推送失败: ${e.message}`);
    }

    return `${parsed.remotePath}/sync_batches/${batchName}`;
  }

  /**
   * 通过 SCP 拉取批次文件
   * @param {string} remote - user@host:/path
   * @param {object} parsed - 已解析的远程地址
   * @returns {Promise<string>} 本地批次文件路径
   */
  async pullLatestBatch(remote, parsed) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-sync-pull-"));
    const localPath = path.join(tempDir, "batch.tar.gz");

    if (parsed.isLocal) {
      // 本地同步：直接读取最新批次
      const batchDir = path.join(parsed.remotePath, "sync_batches");
      if (!(await fs.pathExists(batchDir))) {
        throw new Error("远程仓库中没有同步批次");
      }

      const files = await fs.readdir(batchDir);
      const batchFiles = files
        .filter((f) => f.startsWith("batch_") && f.endsWith(".tar.gz"))
        .sort()
        .reverse();

      if (batchFiles.length === 0) {
        throw new Error("远程仓库中没有同步批次");
      }

      await fs.copyFile(path.join(batchDir, batchFiles[0]), localPath);
      return localPath;
    }

    // 远程同步：SCP 拉取最新批次
    const remoteBatchDir = `${parsed.remotePath}/sync_batches`;
    const sshTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}`;
    const remoteTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}:${remoteBatchDir}/`;

    // 列出远程批次文件
    let batchFiles;
    try {
      const stdout = execFileSync(
        "ssh",
        [sshTarget, "ls", "-1t", remoteBatchDir],
        { stdio: "pipe", timeout: 10000 },
      )
        .toString()
        .trim();

      batchFiles = stdout
        .split("\n")
        .filter((f) => f.startsWith("batch_") && f.endsWith(".tar.gz"))
        .sort()
        .reverse();
    } catch {
      throw new Error(`无法访问远程仓库: ${remote}`);
    }

    if (batchFiles.length === 0) {
      throw new Error("远程仓库中没有同步批次");
    }

    const latestBatch = batchFiles[0];
    try {
      execFileSync("scp", ["-q", `${remoteTarget}${latestBatch}`, localPath], {
        stdio: "pipe",
        timeout: 300000,
      });
    } catch (e) {
      throw new Error(`拉取失败: ${e.message}`);
    }

    return localPath;
  }

  /**
   * 将资源文件从批次写入仓库
   * @param {string} resourceDir - 批次中的 resources/ 目录
   * @param {string} repoPath - 仓库根路径
   */
  async installResources(resourceDir, repoPath) {
    if (!(await fs.pathExists(resourceDir))) return;

    const copyRecursive = async (src, dest) => {
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await fs.ensureDir(destPath);
          await copyRecursive(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    };

    await copyRecursive(resourceDir, repoPath);
  }

  /**
   * 拉取全部批次文件（用于 clone）
   * @param {string} remote
   * @param {object} parsed
   * @returns {Promise<string[]>} 本地批次文件路径列表
   */
  async pullAllBatches(remote, parsed) {
    if (parsed.isLocal) {
      const batchDir = path.join(parsed.remotePath, "sync_batches");
      if (!(await fs.pathExists(batchDir))) {
        return [];
      }

      const files = await fs.readdir(batchDir);
      const batchFiles = files
        .filter((f) => f.startsWith("batch_") && f.endsWith(".tar.gz"))
        .sort();

      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "lo-sync-clone-"),
      );
      const result = [];

      for (const batchFile of batchFiles) {
        const localPath = path.join(tempDir, batchFile);
        await fs.copyFile(path.join(batchDir, batchFile), localPath);
        result.push(localPath);
      }

      return result;
    }

    // 远程同步：SCP 拉取全部批次
    const remoteBatchDir = `${parsed.remotePath}/sync_batches`;
    const sshTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}`;
    const remoteTarget = `${parsed.user ? `${parsed.user}@` : ""}${parsed.host}:${remoteBatchDir}/`;

    // 列出远程批次文件（按字母序 = 时间序）
    let batchFiles;
    try {
      const stdout = execFileSync(
        "ssh",
        [sshTarget, "ls", "-1", remoteBatchDir],
        { stdio: "pipe", timeout: 10000 },
      )
        .toString()
        .trim();

      batchFiles = stdout
        .split("\n")
        .filter((f) => f.startsWith("batch_") && f.endsWith(".tar.gz"))
        .sort();
    } catch {
      return [];
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-sync-clone-"));
    const result = [];

    for (const batchFile of batchFiles) {
      const localPath = path.join(tempDir, batchFile);
      try {
        execFileSync("scp", ["-q", `${remoteTarget}${batchFile}`, localPath], {
          stdio: "pipe",
          timeout: 300000,
        });
        result.push(localPath);
      } catch (e) {
        Logger.warn(`跳过损坏批次 ${batchFile}: ${e.message}`);
      }
    }

    return result;
  }

  /**
   * 清理临时文件
   */
  async cleanup(tempPath) {
    try {
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath);
      }
    } catch {
      // 忽略清理错误
    }
  }
}

module.exports = SyncRemote;
