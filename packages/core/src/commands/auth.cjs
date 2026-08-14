const chalk = require("chalk");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Repository = require("../repo/repository.cjs");
const SshAuth = require("../utils/sshAuth.cjs");
const CryptoUtils = require("../utils/crypto.cjs");
const Logger = require("../utils/logger.cjs");

/**
 * SSH 多密钥认证命令
 *
 * 用法:
 *   lo auth add [key-path] [-l label]    注册一把 SSH 公钥（可多次添加，支持多设备）
 *   lo auth remove <fingerprint>          移除一把已注册的密钥
 *   lo auth list                          列出所有已注册的密钥
 *   lo auth disable                       禁用认证（需先通过验证）
 *   lo auth status                        查看认证状态
 *   lo auth verify                        手动验证身份
 *   lo auth keys                          列出本地可用的 SSH 密钥
 */
module.exports = async function auth(argv) {
  const { action, keyPath, label, ttl, fingerprint } = argv;

  try {
    switch (action) {
      case "add":
      case "enable":
        await handleAdd(keyPath, label, ttl);
        break;
      case "remove":
        await handleRemove(fingerprint);
        break;
      case "list":
        await handleList();
        break;
      case "disable":
        await handleDisable();
        break;
      case "status":
        await handleStatus();
        break;
      case "verify":
        await handleVerify();
        break;
      case "keys":
        await handleLocalKeys();
        break;
      default:
        Logger.error(`未知操作: ${action}`);
        Logger.info(
          "可用操作: add, remove, list, disable, status, verify, keys",
        );
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    Logger.error(`认证操作失败: ${error.message}`);
    process.exit(1);
  }
};

// ──────────────────────────────────────
// 辅助函数：读取/保存已注册的密钥列表
// ──────────────────────────────────────

async function getRegisteredKeys(repo) {
  const json = await repo.getConfig("auth.ssh.keys");
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

async function saveRegisteredKeys(repo, keys) {
  await repo.setConfig("auth.ssh.keys", JSON.stringify(keys));
}

// ──────────────────────────────────────
// add - 追加一把 SSH 公钥
// ──────────────────────────────────────

async function handleAdd(keyPath, label, ttl) {
  if (!SshAuth.isAvailable()) {
    Logger.error("未检测到 ssh-keygen，请安装 OpenSSH");
    Logger.info('  Windows: 在"设置 > 应用 > 可选功能"中添加 OpenSSH 客户端');
    Logger.info("  macOS:   系统自带");
    Logger.info("  Linux:   sudo apt install openssh-client");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  await repo.open({ skipAuth: true });

  try {
    const existingKeys = await getRegisteredKeys(repo);
    let selectedKey;

    if (keyPath) {
      const resolvedPath = path.resolve(keyPath);

      if (!resolvedPath.endsWith(".pub")) {
        Logger.error("请传入公钥文件（.pub 结尾），不要传私钥");
        Logger.info(
          `  示例: lo auth add -k "${resolvedPath}.pub" -l "我的电脑"`,
        );
        process.exit(1);
      }

      if (!fs.existsSync(resolvedPath)) {
        Logger.error(`密钥文件不存在: ${resolvedPath}`);
        process.exit(1);
      }

      const validation = SshAuth.validateKeypair(resolvedPath);
      if (!validation.valid) {
        Logger.error(validation.error);
        process.exit(1);
      }

      try {
        const fingerprint = SshAuth.computeFingerprint(resolvedPath);
        const pubKey = SshAuth.getPublicKey(resolvedPath);
        selectedKey = {
          publicKey: pubKey.raw,
          publicKeyPath: resolvedPath,
          fingerprint,
          keyType: pubKey.type,
          label: label || path.basename(resolvedPath, ".pub"),
        };
      } catch {
        Logger.error("无效的公钥文件");
        process.exit(1);
      }
    } else {
      const keys = SshAuth.listKeys();

      if (keys.length === 0) {
        Logger.error("未找到 SSH 密钥对");
        Logger.info("");
        Logger.info("请先生成 SSH 密钥:");
        Logger.info('  ssh-keygen -t ed25519 -C "your_email@example.com"');
        Logger.info("");
        Logger.info("或手动指定密钥路径:");
        Logger.info("  lo auth add ~/.ssh/id_ed25519.pub");
        process.exit(1);
      }

      // 过滤掉已注册的
      const registeredFingerprints = new Set(
        existingKeys.map((k) => k.fingerprint),
      );
      const availableKeys = keys.filter(
        (k) => !registeredFingerprints.has(k.fingerprint),
      );

      if (availableKeys.length === 0) {
        Logger.warn("当前设备上的所有 SSH 密钥都已注册");
        Logger.info("如需注册其他设备的密钥，请使用 --key-path 指定文件");
        return;
      }

      // 显示可选密钥
      Logger.title("可添加的 SSH 密钥");
      availableKeys.forEach((key, index) => {
        const indicator = key.inAgent ? chalk.green(" [agent]") : "";
        console.log(`  ${chalk.cyan(`[${index + 1}]`)} ${key.name}`);
        console.log(`      类型: ${chalk.yellow(key.type)}`);
        console.log(`      指纹: ${chalk.gray(key.fingerprint)}`);
        console.log(`      标识: ${key.comment}${indicator}`);
        console.log();
      });

      const { default: inquirer } = await import("inquirer");
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "keyIndex",
          message: "选择要添加的 SSH 密钥:",
          choices: availableKeys.map((k, i) => ({
            name: `${k.name} (${k.fingerprint || "未知指纹"})${k.inAgent ? " [agent]" : ""}`,
            value: i,
          })),
        },
        {
          type: "input",
          name: "keyLabel",
          message: '给这个密钥起个名字（如"笔记本"、"台式机"）:',
          default: os.hostname(),
        },
      ]);

      const key = availableKeys[answer.keyIndex];
      const pubKey = SshAuth.getPublicKey(key.publicKeyPath);
      selectedKey = {
        publicKey: pubKey.raw,
        publicKeyPath: key.publicKeyPath,
        fingerprint: key.fingerprint,
        keyType: key.type,
        label: answer.keyLabel || os.hostname(),
      };
    }

    // 检查指纹是否已注册
    if (existingKeys.some((k) => k.fingerprint === selectedKey.fingerprint)) {
      Logger.warn(`该密钥已注册 (${selectedKey.fingerprint})`);
      return;
    }

    // 追加密钥
    existingKeys.push(selectedKey);
    await saveRegisteredKeys(repo, existingKeys);
    await repo.setConfig("auth.ssh.enabled", "true");
    await repo.setConfig("auth.ssh.sessionTtl", String(ttl || 15));

    // ── 使用 SSH 密钥保护仓库加密密钥 ──
    if (CryptoUtils.isEncryptionEnabled(repo.repoPath)) {
      Logger.info("正在使用 SSH 密钥保护仓库加密密钥...");
      const protectResult = await repo.protectCryptoKey(
        selectedKey.publicKeyPath,
        selectedKey.fingerprint,
        selectedKey.label,
      );

      if (protectResult.success) {
        Logger.success(`加密密钥已受 SSH 密钥 "${selectedKey.label}" 保护`);
        Logger.info("  (其他设备需要使用已注册的 SSH 私钥才能解密文件)");
      } else {
        Logger.warn(`加密密钥保护失败: ${protectResult.error}`);
        Logger.info("  仓库文件仍使用明文密钥加密，SSH 认证仅用于门禁");
      }
    }

    Logger.success(`已注册 SSH 密钥: ${selectedKey.label}`);
    Logger.info(`  指纹: ${selectedKey.fingerprint}`);
    Logger.info(`  类型: ${selectedKey.keyType}`);
    Logger.info(`  当前已注册 ${existingKeys.length} 把密钥`);
  } finally {
    await repo.close();
  }
}

// ──────────────────────────────────────
// remove - 移除一把已注册的密钥（通过指纹）
// ──────────────────────────────────────

async function handleRemove(fingerprint) {
  const repo = new Repository(process.cwd());
  await repo.open();

  try {
    const enabled = await repo.getConfig("auth.ssh.enabled");
    if (!enabled) {
      Logger.warn("当前仓库未启用 SSH 认证");
      return;
    }

    const existingKeys = await getRegisteredKeys(repo);
    let removed;

    if (fingerprint) {
      // 通过指纹精确删除
      const index = existingKeys.findIndex(
        (k) => k.fingerprint === fingerprint,
      );
      if (index === -1) {
        Logger.error(`未找到指纹为 ${fingerprint} 的密钥`);
        return;
      }
      removed = existingKeys.splice(index, 1)[0];
      Logger.success(`已移除密钥: ${removed.label} (${fingerprint})`);
    } else {
      // 交互式选择
      if (existingKeys.length === 0) {
        Logger.warn("没有已注册的密钥");
        return;
      }

      Logger.title("已注册的密钥");
      existingKeys.forEach((key, i) => {
        console.log(`  ${chalk.cyan(`[${i + 1}]`)} ${key.label}`);
        console.log(`      类型: ${key.keyType}`);
        console.log(`      指纹: ${chalk.gray(key.fingerprint)}`);
        console.log();
      });

      const { default: inquirer } = await import("inquirer");
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "keyIndex",
          message: "选择要移除的密钥:",
          choices: existingKeys.map((k, i) => ({
            name: `${k.label} (${k.fingerprint})`,
            value: i,
          })),
        },
      ]);

      removed = existingKeys.splice(answer.keyIndex, 1)[0];
      Logger.success(`已移除密钥: ${removed.label}`);
    }

    // 如果全部移除了，自动禁用认证
    if (existingKeys.length === 0) {
      await repo.db.run("DELETE FROM sync_config WHERE key LIKE 'auth.ssh.%'");
      SshAuth.clearSessionCache();
      Logger.info("所有密钥已移除，认证已自动禁用");
    } else {
      await saveRegisteredKeys(repo, existingKeys);
      Logger.info(`剩余 ${existingKeys.length} 把密钥`);
    }

    // ── 清除受保护的加密密钥副本 ──
    if (CryptoUtils.isEncryptionEnabled(repo.repoPath)) {
      // 对于通过 fingerprint 精确删除的，清理对应的保护文件
      if (fingerprint) {
        repo.removeProtectedCryptoKey(fingerprint);
      } else if (removed && removed.fingerprint) {
        repo.removeProtectedCryptoKey(removed.fingerprint);
      }
    }
  } finally {
    await repo.close();
  }
}

// ──────────────────────────────────────
// list - 列出所有已注册的密钥
// ──────────────────────────────────────

async function handleList() {
  const repo = new Repository(process.cwd());
  await repo.open({ skipAuth: true });

  try {
    const enabled = await repo.getConfig("auth.ssh.enabled");
    if (!enabled) {
      Logger.warn("当前仓库未启用 SSH 认证");
      Logger.info(`运行 ${chalk.cyan("lo auth add")} 注册第一把密钥`);
      return;
    }

    const registeredKeys = await getRegisteredKeys(repo);
    if (registeredKeys.length === 0) {
      Logger.warn("没有已注册的密钥");
      return;
    }

    Logger.title(`已注册的密钥 (${registeredKeys.length} 把)`);
    registeredKeys.forEach((key, i) => {
      console.log(`  ${chalk.cyan(`[${i + 1}]`)} ${chalk.bold(key.label)}`);
      console.log(`      类型: ${chalk.yellow(key.keyType)}`);
      console.log(`      指纹: ${chalk.gray(key.fingerprint)}`);
      console.log();
    });

    // 标记哪些密钥在当前设备上可用
    if (SshAuth.isAvailable()) {
      const localKeys = SshAuth.listKeys();
      const localFingerprints = new Set(localKeys.map((k) => k.fingerprint));
      const localAvailable = registeredKeys.filter((k) =>
        localFingerprints.has(k.fingerprint),
      );
      if (localAvailable.length > 0) {
        console.log(
          chalk.green(
            `  当前设备可用: ${localAvailable.map((k) => k.label).join(", ")}`,
          ),
        );
      }
    }
  } finally {
    await repo.close();
  }
}

// ──────────────────────────────────────
// disable - 禁用认证
// ──────────────────────────────────────

async function handleDisable() {
  const repo = new Repository(process.cwd());
  await repo.open();

  try {
    const enabled = await repo.getConfig("auth.ssh.enabled");
    if (!enabled) {
      Logger.warn("当前仓库未启用 SSH 认证");
      return;
    }

    const authResult = await repo.ensureAuthenticated();
    if (!authResult) {
      Logger.error("身份验证失败，无法禁用认证");
      process.exit(1);
    }

    await repo.db.run("DELETE FROM sync_config WHERE key LIKE 'auth.ssh.%'");
    SshAuth.clearSessionCache();

    Logger.success("SSH 认证已禁用");
  } finally {
    await repo.close();
  }
}

// ──────────────────────────────────────
// status - 查看认证状态
// ──────────────────────────────────────

async function handleStatus() {
  Logger.title("SSH 认证状态");

  console.log(
    `  ssh-keygen:    ${SshAuth.isAvailable() ? chalk.green("可用") : chalk.red("不可用")}`,
  );
  if (SshAuth.isAvailable()) {
    const version = SshAuth.getVersion();
    console.log(`  版本:           ${version || "未知"}`);
    console.log(
      `  -Y sign 支持:  ${SshAuth.supportsYSign() ? chalk.green("是") : chalk.yellow("否（需 >= 8.1）")}`,
    );
  }
  console.log(
    `  SSH Agent:     ${SshAuth.isAgentRunning() ? chalk.green("运行中") : chalk.yellow("未运行")}`,
  );

  const repo = new Repository(process.cwd());
  await repo.open({ skipAuth: true });
  try {
    const enabled = await repo.getConfig("auth.ssh.enabled");
    console.log();

    if (enabled) {
      console.log(`  仓库认证:       ${chalk.green("已启用")}`);
      console.log(
        `  会话有效期:     ${await repo.getConfig("auth.ssh.sessionTtl", 15)} 分钟`,
      );

      const registeredKeys = await getRegisteredKeys(repo);
      console.log(`  已注册密钥:     ${registeredKeys.length} 把`);
      registeredKeys.forEach((k) => {
        console.log(`    - ${chalk.cyan(k.label)} (${k.keyType})`);
      });

      // 会话缓存状态
      if (
        SshAuth.isSessionValid(
          repo.repoPath,
          await repo.getConfig("auth.ssh.sessionTtl", 15),
        )
      ) {
        console.log(`  当前会话:       ${chalk.green("已认证")}`);
      } else {
        console.log(`  当前会话:       ${chalk.yellow("未认证")}`);
      }
    } else {
      console.log(`  仓库认证:       ${chalk.gray("未启用")}`);
      console.log();
      console.log(`  运行 ${chalk.cyan("lo auth add")} 注册第一把密钥`);
    }
  } finally {
    await repo.close();
  }
}

// ──────────────────────────────────────
// verify - 手动验证身份
// ──────────────────────────────────────

async function handleVerify() {
  const repo = new Repository(process.cwd());
  await repo.open();

  try {
    const enabled = await repo.getConfig("auth.ssh.enabled");
    if (!enabled) {
      Logger.warn("当前仓库未启用 SSH 认证");
      return;
    }

    Logger.info("正在验证 SSH 身份...");
    const result = await repo.ensureAuthenticated();

    if (result) {
      Logger.info(
        `会话有效期至: ${new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString()}`,
      );
    } else {
      Logger.error("身份验证失败");
      process.exit(1);
    }
  } finally {
    await repo.close();
  }
}

// ──────────────────────────────────────
// keys - 列出本地可用的 SSH 密钥
// ──────────────────────────────────────

async function handleLocalKeys() {
  if (!SshAuth.isAvailable()) {
    Logger.error("未检测到 ssh-keygen");
    process.exit(1);
  }

  const keys = SshAuth.listKeys();

  if (keys.length === 0) {
    Logger.warn("未找到 SSH 密钥对");
    Logger.info("");
    Logger.info("生成新密钥:");
    Logger.info('  ssh-keygen -t ed25519 -C "your_email@example.com"');
    return;
  }

  Logger.title("本地可用的 SSH 密钥");

  keys.forEach((key) => {
    console.log(`  ${chalk.cyan(key.name)}`);
    console.log(`    路径:   ${key.publicKeyPath}`);
    console.log(`    类型:   ${chalk.yellow(key.type)}`);
    console.log(`    指纹:   ${chalk.gray(key.fingerprint || "N/A")}`);
    console.log(`    标识:   ${key.comment}`);
    if (key.inAgent) {
      console.log(`    状态:   ${chalk.green("已加载到 SSH Agent")}`);
    }
    console.log();
  });

  if (SshAuth.isAgentRunning()) {
    console.log(
      chalk.gray("  [agent] 标记表示密钥已加载到 SSH Agent，无需输入密码"),
    );
  }
}
