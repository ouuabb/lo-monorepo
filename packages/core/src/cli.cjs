#!/usr/bin/env node

const yargs = require('yargs');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const init = require('./commands/init.cjs');
const { isCliCommand } = require('./plugin/extensionCommand.cjs');
const newResource = require('./commands/new.cjs');
const list = require('./commands/list.cjs');
const files = require('./commands/files.cjs');
const show = require('./commands/show.cjs');
const edit = require('./commands/edit.cjs');
const deleteResource = require('./commands/delete.cjs');
const index = require('./commands/index.cjs');
const tag = require('./commands/tag.cjs');
const category = require('./commands/category.cjs');
const find = require('./commands/find.cjs');
const stats = require('./commands/stats.cjs');
const link = require('./commands/link.cjs');
const unlink = require('./commands/unlink.cjs');
const relationCmd = require('./commands/relation.cjs');
const graphCmd = require('./commands/graph.cjs');
const securityCmd = require('./commands/security.cjs');
const runtimeCmd = require('./commands/runtime.cjs');
const automationCmd = require('./commands/automation.cjs');
const move = require('./commands/move.cjs');
const backup = require('./commands/backup.cjs');
const repoCmd = require('./commands/repo.cjs');
const daily = require('./commands/daily.cjs');
const configCmd = require('./commands/config.cjs');
const help = require('./commands/help.cjs');
const importCmd = require('./commands/import.cjs');
const sync = require('./commands/sync.cjs');
const manual = require('./commands/manual.cjs');
const docs = require('./commands/docs/index.cjs');
const docsServe = require('./commands/docs-serve.cjs');
const status = require('./commands/status.cjs');
const add = require('./commands/add.cjs');
const commit = require('./commands/commit.cjs');
const reset = require('./commands/reset.cjs');
const log = require('./commands/log.cjs');
const auth = require('./commands/auth.cjs');
const remote = require('./commands/remote.cjs');
const serve = require('./commands/serve.cjs');
const diff = require('./commands/diff.cjs');
const stack = require('./commands/stack.cjs');
const rm = require('./commands/rm.cjs');
const createResourceCmd = require('./commands/resource.cjs');
const containerCmd = require('./commands/container.cjs');
const encrypt = require('./commands/encrypt.cjs');
const decrypt = require('./commands/decrypt.cjs');
const schemaCmd = require('./commands/schema.cjs');
const viewCmd = require('./commands/view.cjs');

const cli = yargs
  .scriptName('lo')
  .version(packageJson.version)
  .usage('$0 <command> [options]')
  .example('$0 new "理解闭包" --type note', '创建新资源')
  .example('$0 list --type image', '列出所有图片资源')
  .example('$0 find "分布式"', '搜索资源')
  .help()
  .alias('h', 'help')
  .alias('v', 'version')
  .strict()
  .exitProcess(false);

cli
  .command('init [name]', '初始化资源仓库', (yargs) => {
    yargs
      .positional('name', {
        type: 'string',
        description: '仓库文件夹名称或路径'
      })
      .option('path', {
        type: 'string',
        description: '初始化路径',
        default: process.cwd()
      })
      .option('encrypt', {
        type: 'boolean',
        description: '启用全仓库加密（文件落盘即密文）',
        default: false
      });
  }, init)

  .command('import <path>', '导入资源（自动应用默认分类）', (yargs) => {
    yargs
      .positional('path', {
        type: 'string',
        description: '文件或目录路径'
      })
      .option('type', {
        type: 'string',
        description: '资源类型 (note, image, pdf, etc.)'
      })
      .option('category', {
        type: 'string',
        description: '分类（支持多级: 父/子/孙）'
      });
  }, importCmd)

  .command('new <name>', '创建新资源', (yargs) => {
    yargs
      .positional('name', {
        type: 'string',
        description: '资源名称'
      })
      .option('type', {
        type: 'string',
        description: '资源类型',
        default: 'note',
        choices: ['note', 'pdf', 'image', 'video', 'audio', 'html', 'text']
      })
      .option('tags', {
        type: 'string',
        description: '标签，逗号分隔'
      })
      .option('template', {
        type: 'string',
        description: '使用模板'
      })
      .option('category', {
        type: 'string',
        description: '分类目录'
      })
      .option('encrypt', {
        type: 'boolean',
        description: '加密此文件',
        default: false
      });
  }, newResource)

  .command('list', '列出所有资源', (yargs) => {
    yargs
      .option('type', {
        type: 'string',
        description: '按类型过滤 (note, image, pdf, etc.)'
      })
      .option('status', {
        type: 'boolean',
        description: '仅显示有状态变更的资源',
        default: false
      })
      .option('tag', {
        type: 'string',
        description: '按标签过滤'
      })
      .option('category', {
        type: 'string',
        description: '按分类过滤'
      })
      .option('limit', {
        type: 'number',
        description: '限制数量',
        default: 20
      })
      .option('format', {
        type: 'string',
        description: '输出格式',
        choices: ['table', 'json', 'list'],
        default: 'table'
      });
  }, list)

  .command('files', '列出可操作文件（resources/ 目录下的文件）', (yargs) => {
    yargs
      .option('type', {
        type: 'string',
        description: '按类型过滤'
      })
      .option('status', {
        type: 'boolean',
        description: '仅显示有状态变更的文件'
      })
      .option('tag', {
        type: 'string',
        description: '按标签过滤'
      })
      .option('category', {
        type: 'string',
        description: '按分类过滤'
      })
      .option('limit', {
        type: 'number',
        description: '限制数量',
        default: 20
      })
      .option('format', {
        type: 'string',
        description: '输出格式',
        choices: ['table', 'json', 'list'],
        default: 'table'
      });
  }, files)

  .command('show <rid>', '查看资源', (yargs) => {
    yargs
      .positional('rid', {
        type: 'string',
        description: '资源 RID 或文件路径'
      })
      .option('raw', {
        type: 'boolean',
        description: '显示原始内容',
        default: false
      });
  }, show)

  .command('edit <rid>', '编辑资源', (yargs) => {
    yargs
      .positional('rid', {
        type: 'string',
        description: '资源 RID 或文件路径'
      })
      .option('editor', {
        type: 'string',
        description: '指定编辑器'
      });
  }, edit)

  .command('delete <rid>', '删除资源', (yargs) => {
    yargs
      .positional('rid', {
        type: 'string',
        description: '资源 RID 或文件路径'
      })
      .option('force', {
        type: 'boolean',
        description: '强制删除，不确认'
      })
      .option('hard', {
        type: 'boolean',
        description: '永久删除（不可恢复）',
        default: false
      });
  }, deleteResource)

  .command('encrypt [rid]', '加密资源（单文件或全部）', (yargs) => {
    yargs
      .positional('rid', {
        type: 'string',
        description: '资源 RID（不指定时需配合 --all）'
      })
      .option('all', {
        type: 'boolean',
        description: '加密所有未加密的文件',
        default: false
      });
  }, encrypt)

  .command('decrypt [rid]', '解密资源（单文件或全部）', (yargs) => {
    yargs
      .positional('rid', {
        type: 'string',
        description: '资源 RID（不指定时需配合 --all）'
      })
      .option('all', {
        type: 'boolean',
        description: '解密所有已加密的文件',
        default: false
      });
  }, decrypt)

  .command('index', '生成索引', {}, index)

  .command('tag <action> [rid] [tag]', '管理标签', (yargs) => {
    yargs
      .positional('action', {
        type: 'string',
        choices: ['add', 'rm', 'list']
      })
      .positional('rid', {
        type: 'string',
        description: '资源 RID 或文件路径'
      });
  }, tag)

  .command('category <action> [rid] [category]', '管理分类', (yargs) => {
    yargs
      .positional('action', {
        type: 'string',
        choices: ['set', 'rm', 'list', 'tree']
      })
      .positional('rid', {
        type: 'string',
        description: '资源 RID 或文件路径'
      })
      .positional('category', {
        type: 'string',
        description: '分类名称'
      });
  }, category)

  .command('find <query>', '搜索资源', (yargs) => {
    yargs
      .positional('query', {
        type: 'string',
        description: '搜索关键词'
      })
      .option('limit', {
        type: 'number',
        description: '结果数量限制',
        default: 10
      })
      .option('type', {
        type: 'string',
        description: '按类型过滤'
      });
  }, find)

  .command('stats', '显示统计信息', (yargs) => {
    yargs
      .option('today', {
        type: 'boolean',
        description: '只统计今天'
      })
      .option('week', {
        type: 'boolean',
        description: '只统计本周'
      });
  }, stats)

  .command('link <from> <to>', '建立资源链接', (yargs) => {
    yargs
      .positional('from', {
        type: 'string',
        description: '源资源 RID 或路径'
      })
      .positional('to', {
        type: 'string',
        description: '目标资源 RID 或路径'
      })
      .option('type', {
        type: 'string',
        description: '链接类型',
        default: 'reference'
      });
  }, link)

  .command('unlink <from> <to>', '解除资源链接', (yargs) => {
    yargs
      .positional('from', {
        type: 'string',
        description: '源资源（RID 或路径）'
      })
      .positional('to', {
        type: 'string',
        description: '目标资源（RID 或路径）'
      })
      .option('type', {
        type: 'string',
        description: '链接类型',
        default: 'reference'
      });
  }, unlink)

  .command('relation', '资源关系管理（Phase 5.1）', (yargs) => {
    yargs
      .command('add <from> <to>', '创建关系', (yargs) => {
        yargs
          .positional('from', { type: 'string', description: '源资源（名称或 RID）' })
          .positional('to', { type: 'string', description: '目标资源（名称或 RID）' })
          .option('type', { type: 'string', default: 'reference', description: '关系类型' })
          .option('label', { type: 'string', description: '关系标签' });
      }, relationCmd.add)

      .command('remove <id>', '删除关系（软删除）', (yargs) => {
        yargs
          .positional('id', { type: 'number', description: '关系 id' });
      }, relationCmd.remove)

      .command('list', '列出关系', (yargs) => {
        yargs
          .option('resource', { type: 'string', alias: 'r', description: '按资源筛选' })
          .option('type', { type: 'string', description: '按类型筛选' });
      }, relationCmd.list)

      .command('show <id>', '查看关系详情', (yargs) => {
        yargs
          .positional('id', { type: 'number', description: '关系 id' });
      }, relationCmd.show)

      .demandCommand(1, '请指定关系子命令。可用: add, remove, list, show');
  })

  .command('graph', '资源关系图查询（Phase 5.3）', (yargs) => {
    yargs
      .command('neighbors <resource>', '查询资源的邻居节点', (yargs) => {
        yargs.positional('resource', { type: 'string', description: '资源名称或 RID' });
      }, graphCmd.neighbors)

      .command('backlinks <resource>', '谁引用了这个资源', (yargs) => {
        yargs.positional('resource', { type: 'string', description: '资源名称或 RID' });
      }, graphCmd.backlinks)

      .command('path <from> <to>', '最短路径查询', (yargs) => {
        yargs
          .positional('from', { type: 'string', description: '起始资源' })
          .positional('to', { type: 'string', description: '目标资源' });
      }, graphCmd.path)

      .command('cycles', '检测图中的环', () => {}, graphCmd.cycles)

      .command('export', '导出图（支持 html/svg/json/dot/mermaid/adjacency）', (yargs) => {
        yargs.option('format', {
          type: 'string',
          default: 'json',
          choices: ['json', 'dot', 'mermaid', 'adjacency', 'html', 'svg'],
          description: '导出格式'
        })
        .option('layout', {
          type: 'string',
          default: 'force',
          choices: ['force', 'tree', 'radial'],
          description: '布局算法（html/svg/json 时生效）'
        })
        .option('rid', {
          type: 'string',
          description: '中心资源（邻域视图）'
        })
        .option('depth', {
          type: 'number',
          default: 2,
          description: '邻域深度'
        })
        .option('type', {
          type: 'string',
          description: '关系类型过滤'
        })
        .option('output', {
          type: 'string',
          alias: 'o',
          description: '输出文件路径'
        });
      }, graphCmd.export)

      .command('analyze <type>', '图分析（pagerank/central/isolated/clusters）', (yargs) => {
        yargs
          .positional('type', {
            type: 'string',
            choices: ['pagerank', 'central', 'isolated', 'clusters'],
            description: '分析类型'
          })
          .option('top', { type: 'number', default: 10, description: 'Top N 结果' });
      }, graphCmd.analyze)

      .command('query <resource>', '图查询 DSL', (yargs) => {
        yargs
          .positional('resource', { type: 'string', description: '起始资源' })
          .option('depth', { type: 'number', default: 1, description: '遍历深度' })
          .option('direction', { type: 'string', default: 'both', choices: ['outgoing', 'incoming', 'both'], description: '遍历方向' })
          .option('type', { type: 'string', description: '关系类型过滤' });
      }, graphCmd.query)

      .command('neighborhood <resource>', '资源邻域视图（Phase 5.5）', (yargs) => {
        yargs
          .positional('resource', { type: 'string', description: '资源名称或 RID' })
          .option('depth', { type: 'number', default: 2, description: '探索深度' });
      }, graphCmd.neighborhood)

      .command('explain <a> <b>', '解释两个资源之间的知识路径（Phase 5.5）', (yargs) => {
        yargs
          .positional('a', { type: 'string', description: '起始资源' })
          .positional('b', { type: 'string', description: '目标资源' });
      }, graphCmd.explain)

      .command('query-federated <globalId>', '联邦图查询（Phase 5.10）', (yargs) => {
        yargs
          .positional('globalId', { type: 'string', description: '全局 ID（如 personal:note001）' })
          .option('depth', { type: 'number', default: 3, description: '遍历深度' });
      }, graphCmd.graphQueryFederated)

      .demandCommand(1, '请指定图子命令。可用: neighbors, backlinks, path, cycles, export, analyze, query, neighborhood, explain, query-federated');
  })

  .command('move <rid> <dest>', '移动资源', (yargs) => {
    yargs
      .positional('rid', {
        type: 'string',
        description: '资源 RID 或文件路径'
      })
      .positional('dest', {
        type: 'string',
        description: '目标路径'
      });
  }, move)

  .command('backup', '备份资源仓库', (yargs) => {
    yargs
      .option('dest', {
        type: 'string',
        description: '备份目标目录',
        default: './backups'
      })
      .option('compress', {
        type: 'boolean',
        description: '压缩备份',
        default: false
      });
  }, backup)

  .command('repo', '仓库管理（Repository Identity）', (yargs) => {
    yargs
      .command('reinitialize', '重新初始化仓库身份（副本独立化唯一途径）', (y) => {
        y.option('yes', {
          type: 'boolean',
          description: '跳过确认',
          default: false,
        });
      }, repoCmd.repoReinitialize)
      .demandCommand(1, '请指定仓库子命令。可用: reinitialize');
  })

  .command('daily', '创建今日日记', {}, daily)

  .command('config <action> [key] [dir]', '管理配置', (yargs) => {
    yargs
      .positional('action', {
        type: 'string',
        describe: '操作类型',
        choices: ['list', 'add', 'rm']
      })
      .positional('key', {
        type: 'string',
        describe: '配置键名'
      })
      .positional('dir', {
        type: 'string',
        describe: '目录路径'
      });
  }, configCmd)

  .command('sync', '同步资源（本地文件到数据库；子命令为联邦同步）', (yargs) => {
    yargs
      .option('full', {
        type: 'boolean',
        description: '执行全量同步（扫描所有文件，而非增量）',
        default: false
      })
      .option('quiet', {
        type: 'boolean',
        description: '静默模式，不输出详细报告',
        default: false
      })
      .option('wikilinks', {
        type: 'boolean',
        description: '解析并同步所有 .md 文件的 [[...]] 双向链接',
        default: false
      })
      .command('pull <namespace>', '从远程仓库拉取资源', (yargs) => {
        yargs.positional('namespace', { type: 'string', description: '远程 namespace' });
      }, graphCmd.syncPull)

      .command('push <namespace>', '推送本地资源到远程仓库', (yargs) => {
        yargs.positional('namespace', { type: 'string', description: '远程 namespace' });
      }, graphCmd.syncPush)

      .command('status', '查看同步状态', {}, graphCmd.syncStatus)

      .command('conflict', '冲突管理', (yargs) => {
        yargs
          .command('list', '列出待解决冲突', {}, graphCmd.syncConflictList)
          .command('resolve <id> <strategy>', '解决冲突', (yargs) => {
            yargs
              .positional('id', { type: 'string', description: 'Conflict ID' })
              .positional('strategy', { type: 'string', description: 'local-win | remote-win | manual' });
          }, graphCmd.syncConflictResolve)
          .demandCommand(1, '请指定冲突子命令。可用: list, resolve');
      });
  }, sync)

  .command('push <remote>', '推送变更到远程设备', (yargs) => {
    yargs
      .positional('remote', {
        type: 'string',
        description: '远程地址 (user@host:/path 或 /local/path) 或别名'
      })
      .option('full', {
        type: 'boolean',
        description: '修复用：忽略远程清单，全量重推',
        default: false
      });
  }, sync)

  .command('pull <remote>', '从远程设备拉取变更', (yargs) => {
    yargs
      .positional('remote', {
        type: 'string',
        description: '远程地址 (user@host:/path 或 /local/path) 或别名'
      });
  }, sync)

  .command('clone <remote>', '从远程仓库克隆', (yargs) => {
    yargs
      .positional('remote', {
        type: 'string',
        description: '远程地址 (user@host:/path 或 /local/path) 或别名'
      })
      .option('dest', {
        type: 'string',
        description: '克隆目标目录',
        alias: 'd'
      });
  }, sync)

  .command('remote <action> [name] [url]', '管理远程仓库别名', (yargs) => {
    yargs
      .positional('action', {
        type: 'string',
        description: '操作类型',
        choices: ['add', 'remove', 'rm', 'list', 'ls']
      })
      .positional('name', {
        type: 'string',
        description: '远程别名'
      })
      .positional('url', {
        type: 'string',
        description: '远程地址 (user@host:/path 或 /local/path, add 时需要)'
      });
  }, remote)

  .command('manual [command]', '查看命令手册（可指定命令）', (yargs) => {
    yargs
      .positional('command', {
        type: 'string',
        description: '要查看的命令名称（如 new, auth, init 等）'
      });
  }, manual)

  .command('docs [topic|serve]', '查看项目功能详解', (yargs) => {
    yargs
      .command('serve', '启动 VitePress 文档站点', {}, docsServe)
      .positional('topic', {
        type: 'string',
        description: '查看的主题'
      });
  }, docs)

  .command('status', '查看工作区状态', (yargs) => {
    yargs.option('path', {
      type: 'string',
      description: '仓库路径',
      default: process.cwd()
    });
  }, status)

  .command('diff [path]', '显示文件变更差异', (yargs) => {
    yargs
      .positional('path', {
        type: 'string',
        description: '指定文件或目录（留空显示所有变更）'
      });
  }, diff)

  .command('add [path]', '添加文件到暂存区', (yargs) => {
    yargs
      .positional('path', {
        type: 'string',
        description: '文件或目录路径，使用 . 添加所有'
      });
  }, add)

  .command('rm [path]', '暂存文件删除', (yargs) => {
    yargs
      .positional('path', {
        type: 'string',
        description: '要删除的文件路径'
      });
  }, rm)

  .command('create', '创建资源', (yargs) => {
    yargs
      .command('resource <type> <path>', '创建具有 Container Capability 的 Resource', (yargs) => {
        yargs
          .positional('type', {
            type: 'string',
            description: '资源类型',
            choices: ['project', 'album', 'dataset', 'course', 'collection']
          })
          .positional('path', {
            type: 'string',
            description: '内容来源路径（目录）'
          })
          .option('name', {
            type: 'string',
            description: '资源名称（默认使用目录名）'
          })
          .option('no-scan', {
            type: 'boolean',
            description: '跳过自动扫描成员',
            default: false
          });
      }, createResourceCmd)
      .demandCommand(1, '请指定 create 的子命令');
  })

  .command('resource', '资源导航（Phase 5.5）', (yargs) => {
    yargs
      .command('related <resource>', '相关资源推荐', (yargs) => {
        yargs
          .positional('resource', { type: 'string', description: '资源名称或 RID' })
          .option('top', { type: 'number', default: 10, description: '推荐数量' });
      }, graphCmd.related)

      .command('backlinks <resource>', '反向链接（谁引用了我）', (yargs) => {
        yargs
          .positional('resource', { type: 'string', description: '资源名称或 RID' });
      }, graphCmd.resourceBacklinks)

      .command('impact <resource>', '影响分析', (yargs) => {
        yargs
          .positional('resource', { type: 'string', description: '资源名称或 RID' });
      }, graphCmd.impact)

      .demandCommand(1, '请指定资源子命令。可用: related, backlinks, impact');
  })

  .command('knowledge', '知识智能（Phase 5.7）', (yargs) => {
    yargs
      .command('analyze', '知识分析报告（密度、孤岛、缺口）', {}, graphCmd.knowledgeAnalyze)

      .command('gaps', '知识缺口检测', {}, graphCmd.knowledgeGaps)

      .command('recommend <resource>', '智能推荐（关联知识 + 下一步学习）', (yargs) => {
        yargs
          .positional('resource', { type: 'string', description: '资源名称或 RID' })
          .option('top', { type: 'number', default: 10, description: '推荐数量' });
      }, graphCmd.knowledgeRecommend)

      .command('timeline', '知识演化时间线', {}, graphCmd.knowledgeTimeline)

      .command('lifecycle', '知识生命周期状态', {}, graphCmd.knowledgeLifecycle)

      .command('repair', '知识修复诊断（断裂关系/孤立资源/重复资源）', {}, graphCmd.knowledgeRepairDiagnosis)

      .command('ai', 'AI 知识助手', (yargs) => {
        yargs
          .command('explain <resource>', 'AI 解释资源位置', (yargs) => {
            yargs.positional('resource', { type: 'string', description: '资源名称或 RID' });
          }, graphCmd.knowledgeAIExplain)

          .command('summarize <resource>', 'AI 为资源生成摘要', (yargs) => {
            yargs.positional('resource', { type: 'string', description: '资源名称或 RID' });
          }, graphCmd.knowledgeAISummarize)

          .command('ask [query]', 'AI 知识问答', (yargs) => {
            yargs
              .positional('query', { type: 'string', description: '问题（如"缺什么"、"核心节点"、"推荐"）', default: 'overview' });
          }, graphCmd.knowledgeAIAsk)

          .demandCommand(1, '请指定 AI 子命令。可用: explain, summarize, ask');
      })

      .command('evolution', '知识演化分析（增长/速度/熵/趋势）', {}, graphCmd.knowledgeEvolution)

      .command('patterns', '知识模式检测（Hub/Chain/Bridge/Dead-end）', {}, graphCmd.knowledgePatterns)

      .command('strategy', '知识构建策略推荐', {}, graphCmd.knowledgeStrategy)

      .command('snapshot', '创建知识状态快照', {}, graphCmd.knowledgeSnapshot)

      .demandCommand(1, '请指定知识子命令。可用: analyze, gaps, recommend, timeline, lifecycle, repair, ai, evolution, patterns, strategy, snapshot');
  })

  .command('suggestion', 'AI 建议管理（Phase 5.8）', (yargs) => {
    yargs
      .command('list', '查看建议列表', (yargs) => {
        yargs.option('status', { type: 'string', description: '过滤状态: pending/approved/rejected' });
      }, graphCmd.suggestionList)

      .command('approve <id>', '批准 AI 建议', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Suggestion ID' });
      }, graphCmd.suggestionApprove)

      .command('execute <id>', '执行已批准的建议（创建 relation）', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Suggestion ID' });
      }, graphCmd.suggestionExecute)

      .command('reject <id>', '拒绝 AI 建议', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Suggestion ID' });
      }, graphCmd.suggestionReject)

      .demandCommand(1, '请指定建议子命令。可用: list, approve, execute, reject');
  })

  .command('automation', 'Automation 行为编排（Phase 5.9 + 行为层）', (yargs) => {
    yargs
      .command('list', '列出所有自动化', {}, automationCmd.automationList)

      .command('show <id>', '查看自动化详情', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Automation ID' });
      }, automationCmd.automationShow)

      .command('create <id>', '创建自动化', (yargs) => {
        yargs
          .positional('id', { type: 'string', description: 'Automation ID' })
          .option('name', { type: 'string', description: '显示名称' })
          .option('description', { type: 'string', description: '描述' })
          .option('trigger', { type: 'string', description: 'Trigger JSON，如 {"type":"schedule","schedule":{"cadence":"daily","time":"22:00"}}' })
          .option('type', { type: 'string', default: 'knowledge.maintenance', description: '默认 Action 类型' })
          .option('actions', { type: 'string', description: 'Actions JSON 数组' })
          .option('condition', { type: 'string', description: '条件表达式，如 resource.type == "book"' })
          .option('source', { type: 'string', choices: ['builtin', 'user', 'agent', 'plugin'], default: 'user', description: '来源' })
          .option('risk', { type: 'string', choices: ['low', 'high'], default: 'low', description: '风险级别' })
          .option('require-approval', { type: 'boolean', default: false, description: '高风险动作是否需要批准' });
      }, automationCmd.automationCreate)

      .command('enable <id>', '启用自动化', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Automation ID' });
      }, automationCmd.automationEnable)

      .command('disable <id>', '停用自动化', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Automation ID' });
      }, automationCmd.automationDisable)

      .command('run [id]', '运行自动化（缺省运行内置知识维护）', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Automation ID（缺省: knowledge.maintenance.daily）' });
      }, automationCmd.automationRun)

      .command('history [id]', '查看执行历史', (yargs) => {
        yargs
          .positional('id', { type: 'string', description: '按 Automation ID 过滤' })
          .option('limit', { type: 'number', default: 20, description: '条数限制' });
      }, automationCmd.automationHistory)

      .demandCommand(1, '请指定自动化子命令。可用: list, show, create, enable, disable, run, history');
  })

  .command('federation', '联邦仓库管理（Phase 5.10）', (yargs) => {
    yargs
      .command('list', '列出已注册的联邦仓库', {}, graphCmd.federationList)

      .command('add <path>', '注册联邦仓库', (yargs) => {
        yargs
          .positional('path', { type: 'string', description: '仓库路径' })
          .option('namespace', { type: 'string', demandOption: true, description: '命名空间' })
          .option('name', { type: 'string', description: '显示名称' });
      }, graphCmd.federationAdd)

      .command('remove <namespace>', '移除联邦仓库', (yargs) => {
        yargs.positional('namespace', { type: 'string', description: '命名空间或名称' });
      }, graphCmd.federationRemove)

      .demandCommand(1, '请指定联邦子命令。可用: list, add, remove');
  })

  .command('plugin', '插件系统管理（Phase 6.1）', (yargs) => {
    yargs
      .command('list', '列出已加载插件', {}, graphCmd.pluginList)

      .command('enable <id>', '启用插件', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
      }, graphCmd.pluginEnable)

      .command('disable <id>', '禁用插件', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
      }, graphCmd.pluginDisable)

      .command('reload <id>', '重载插件', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
      }, graphCmd.pluginReload)

      .command('info <id>', '查看插件详情', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
      }, graphCmd.pluginInfo)

      .command('discover [provider] [source]', 'P0-3: 资源发现管道', (yargs) => {
        yargs.positional('provider', { type: 'string', description: 'ResourceProvider 扩展点 key' });
        yargs.positional('source', { type: 'string', description: '数据源路径/URL' });
        yargs.option('dry-run', { type: 'boolean', description: '只发现不写入', default: false });
      }, graphCmd.pluginDiscover)

      .command('install <id>', '从 lo 插件仓库安装插件', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
      }, graphCmd.pluginInstall)

      .command('uninstall <id>', '卸载插件', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
        yargs.option('delete', { type: 'boolean', description: '同时删除插件文件', default: false });
      }, graphCmd.pluginUninstall)

      .command('config <id> [key] [value]', '查看/设置插件配置', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
        yargs.positional('key', { type: 'string', description: '配置项 key（省略则显示全部）' });
        yargs.positional('value', { type: 'string', description: '配置项 value（省略则显示该 key）' });
      }, graphCmd.pluginConfig)

      .command('watch [provider] [source]', 'P1: 启动资源增量监听（Ctrl+C 退出）', (yargs) => {
        yargs.positional('provider', { type: 'string', description: 'ResourceProvider 扩展点 key' });
        yargs.positional('source', { type: 'string', description: '数据源路径/URL' });
      }, graphCmd.pluginWatch)

      .command('search [keyword]', 'P1: 搜索远程插件仓库', (yargs) => {
        yargs.positional('keyword', { type: 'string', description: '关键词（id/name/description 模糊匹配）' });
      }, graphCmd.pluginSearch)

      .command('update <id>', 'P1: 更新插件到最新版本（保留配置）', (yargs) => {
        yargs.positional('id', { type: 'string', description: '插件 ID' });
      }, graphCmd.pluginUpdate)

      .demandCommand(1, '请指定插件子命令。可用: list, enable, disable, reload, info, discover, install, uninstall, config, watch, search, update');
  })

  .command('event', '事件系统（Phase 6.2）', (yargs) => {
    yargs
      .command('list', '查看事件列表', (yargs) => {
        yargs.option('type', { type: 'string', description: '按类型过滤' });
        yargs.option('source', { type: 'string', description: '按来源过滤' });
        yargs.option('limit', { type: 'number', description: '数量限制', default: 20 });
      }, graphCmd.eventList)

      .command('history', '事件统计', {}, graphCmd.eventHistory)

      .command('listeners [type]', '查看事件监听器', (yargs) => {
        yargs.positional('type', { type: 'string', description: '事件类型（可选，不指定则列出全部）' });
      }, graphCmd.eventListeners)

      .command('replay [id]', '事件回放', (yargs) => {
        yargs.positional('id', { type: 'string', description: '起始事件 ID（可选）' });
        yargs.option('limit', { type: 'number', description: '数量限制', default: 20 });
      }, graphCmd.eventReplay)

      .demandCommand(1, '请指定事件子命令。可用: list, history, listeners, replay');
  })

  .command('workflow', 'Workflow 过程模型系统（状态机为核心执行模型）', (yargs) => {
    yargs
      .command('list', '列出工作流', {}, graphCmd.workflowList)

      .command('show <id>', '查看工作流定义', (yargs) => {
        yargs.positional('id', { type: 'string', description: '工作流 ID' });
      }, graphCmd.workflowShow)

      .command('versions <id>', '查看工作流定义版本快照', (yargs) => {
        yargs.positional('id', { type: 'string', description: '工作流 ID' });
        yargs.option('version', { type: 'number', description: '查看指定版本的冻结定义' });
      }, graphCmd.workflowVersions)

      .command('create <id>', '创建工作流', (yargs) => {
        yargs.positional('id', { type: 'string', description: '工作流 ID' });
        yargs.option('name', { type: 'string', description: '名称' });
        yargs.option('description', { type: 'string', description: '描述' });
        yargs.option('version', { type: 'number', description: '定义版本（默认 1）' });
        yargs.option('applicable', { type: 'array', description: '可选作用域：可作用的 Schema id/name 列表（空 = 不限制）' });
        yargs.option('schema', { type: 'string', description: '（已废弃别名）绑定 Schema id/name' });
        yargs.option('file', { type: 'string', description: '定义 JSON 文件' });
      }, graphCmd.workflowCreate)

      .command('update <id>', '更新工作流定义', (yargs) => {
        yargs.positional('id', { type: 'string', description: '工作流 ID' });
        yargs.option('file', { type: 'string', description: '定义 JSON 文件' });
        yargs.option('name', { type: 'string', description: '名称' });
        yargs.option('description', { type: 'string', description: '描述' });
        yargs.option('version', { type: 'number', description: '定义版本（结构变化时升版）' });
        yargs.option('applicable', { type: 'array', description: '可选作用域 Schema 列表' });
        yargs.option('status', { type: 'string', description: 'active/inactive/deprecated' });
      }, graphCmd.workflowUpdate)

      .command('rm <id>', '删除工作流（软删：标记 deprecated，保留历史）', (yargs) => {
        yargs.positional('id', { type: 'string', description: '工作流 ID' });
        yargs.option('purge', { type: 'boolean', description: '彻底删除（定义 + 实例/日志级联）' });
      }, graphCmd.workflowRemove)

      .command('attach <rid> <wfid>', 'Resource 加入工作流（已有 active 实例则复用，否则创建新实例）', (yargs) => {
        yargs.positional('rid', { type: 'string', description: 'Resource RID' });
        yargs.positional('wfid', { type: 'string', description: '工作流 ID' });
        yargs.option('state', { type: 'string', description: '初始状态（默认第一个状态）' });
        yargs.option('actor', { type: 'string', description: '操作者' });
      }, graphCmd.workflowAttach)

      .command('detach <instanceId>', 'Resource 退出工作流（结束当前实例，历史保留）', (yargs) => {
        yargs.positional('instanceId', { type: 'string', description: '实例 ID' });
      }, graphCmd.workflowDetach)

      .command('resume <instanceId>', '恢复已 detached 的实例（保留当前状态与历史）', (yargs) => {
        yargs.positional('instanceId', { type: 'string', description: '实例 ID' });
        yargs.option('actor', { type: 'string', description: '操作者' });
      }, graphCmd.workflowResume)

      .command('transition <rid> <wfid> <to>', '执行状态转换', (yargs) => {
        yargs.positional('rid', { type: 'string', description: 'Resource RID' });
        yargs.positional('wfid', { type: 'string', description: '工作流 ID' });
        yargs.positional('to', { type: 'string', description: '目标状态' });
        yargs.option('actor', { type: 'string', description: '操作者' });
        yargs.option('metadata', { type: 'string', description: '附加元数据 JSON' });
      }, graphCmd.workflowTransition)

      .command('can <rid> <wfid> <to>', '预检状态转换', (yargs) => {
        yargs.positional('rid', { type: 'string', description: 'Resource RID' });
        yargs.positional('wfid', { type: 'string', description: '工作流 ID' });
        yargs.positional('to', { type: 'string', description: '目标状态' });
      }, graphCmd.workflowCanTransition)

      .command('instances', '列出工作流实例', (yargs) => {
        yargs.option('wf', { type: 'string', description: '按工作流过滤' });
        yargs.option('rid', { type: 'string', description: '按资源过滤' });
      }, graphCmd.workflowInstances)

      .command('history [id]', '查询转换历史', (yargs) => {
        yargs.positional('id', { type: 'string', description: '工作流 ID / 实例 ID / RID（可选）' });
        yargs.option('limit', { type: 'number', description: '数量限制', default: 20 });
      }, graphCmd.workflowHistory)

      .demandCommand(1, '请指定工作流子命令。可用: list, show, versions, create, update, rm, attach, detach, resume, transition, can, instances, history');
  })

  .command('schema', 'Schema 语义系统管理', (yargs) => {
    yargs
      .command('create <id>', '创建 Schema', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Schema ID' });
        yargs.option('name', { type: 'string', description: '显示名（默认等于 id）' });
        yargs.option('field', { type: 'array', description: '字段定义 JSON，可多次传入' });
        yargs.option('behavior', { type: 'array', description: '行为语义声明 JSON，可多次传入' });
        yargs.option('file', { type: 'string', description: '从 JSON 文件读取定义（fields/relations/metadata/behaviors）' });
      }, schemaCmd.create)

      .command('list', '列出 Schema', (yargs) => {
        yargs.option('status', { type: 'string', choices: ['active', 'deprecated'], description: '按状态过滤' });
      }, schemaCmd.list)

      .command('show <id>', '查看 Schema 详情', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Schema ID 或名称' });
      }, schemaCmd.show)

      .command('update <id>', '更新 Schema（结构变更自动升版）', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Schema ID' });
        yargs.option('name', { type: 'string', description: '新显示名' });
        yargs.option('field', { type: 'array', description: '新的字段定义 JSON 列表（整体替换）' });
        yargs.option('behavior', { type: 'array', description: '新的行为语义声明 JSON（整体替换）' });
        yargs.option('status', { type: 'string', choices: ['active', 'deprecated'], description: '新状态' });
      }, schemaCmd.update)

      .command('rm <id>', '删除 Schema（引用级联清除）', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Schema ID' });
      }, schemaCmd.remove)

      .command('attach <rid> <schema>', '资源绑定 Schema', (yargs) => {
        yargs.positional('rid', { type: 'string', description: '资源 RID' });
        yargs.positional('schema', { type: 'string', description: 'Schema ID 或名称' });
      }, schemaCmd.attach)

      .command('detach <rid>', '资源解除 Schema 绑定', (yargs) => {
        yargs.positional('rid', { type: 'string', description: '资源 RID' });
      }, schemaCmd.detach)

      .command('validate <rid>', '校验资源 metadata 是否符合绑定 Schema', (yargs) => {
        yargs.positional('rid', { type: 'string', description: '资源 RID' });
      }, schemaCmd.validate)

      .demandCommand(1, '请指定 Schema 子命令。可用: create, list, show, update, rm, attach, detach, validate');
  })

  .command('view', 'View 资源观察层管理（方案 C）', (yargs) => {
    yargs
      .command('create <id>', '创建 View', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'View ID' });
        yargs.option('name', { type: 'string', description: '显示名（默认等于 id）' });
        yargs.option('mode', { type: 'string', choices: ['table', 'card', 'kanban', 'calendar', 'timeline', 'list'], description: '展示模式' });
        yargs.option('query', { type: 'string', description: 'Query Definition JSON，如 {"conditions":[{"field":"schema","operator":"in","value":["Book","Note"]}]}' });
        yargs.option('condition', { type: 'array', description: '查询条件 JSON，可多次传入，如 {"field":"status","operator":"=","value":"waiting"}' });
        yargs.option('field', { type: 'array', description: '字段投影 JSON，可多次传入，如 {"name":"status","label":"状态"}' });
        yargs.option('file', { type: 'string', description: '从 JSON 文件读取定义（query/fields/mode/presentation）' });
      }, viewCmd.create)

      .command('list', '列出 View', (yargs) => {
        yargs.option('status', { type: 'string', choices: ['active', 'deprecated'], description: '按状态过滤' });
      }, viewCmd.list)

      .command('show <id>', '查看 View 详情', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'View ID 或名称' });
      }, viewCmd.show)

      .command('update <id>', '更新 View', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'View ID' });
        yargs.option('name', { type: 'string', description: '新显示名' });
        yargs.option('mode', { type: 'string', choices: ['table', 'card', 'kanban', 'calendar', 'timeline', 'list'], description: '新展示模式' });
        yargs.option('query', { type: 'string', description: '新 Query Definition JSON' });
        yargs.option('condition', { type: 'array', description: '新查询条件 JSON（整体替换），可多次传入' });
        yargs.option('field', { type: 'array', description: '新字段投影 JSON（整体替换），可多次传入' });
        yargs.option('status', { type: 'string', choices: ['active', 'deprecated'], description: '新状态' });
      }, viewCmd.update)

      .command('rm <id>', '删除 View', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'View ID' });
      }, viewCmd.remove)

      .command('run <id>', '执行 View 并输出资源集合', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'View ID 或名称' });
        yargs.option('limit', { type: 'number', description: '限制返回条数' });
        yargs.option('format', { type: 'string', choices: ['table', 'json'], description: '输出格式', default: 'table' });
      }, viewCmd.run)

      .command('export <id>', '导出 View 定义', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'View ID' });
        yargs.option('file', { type: 'string', description: '写入文件路径（缺省输出到终端）' });
      }, viewCmd.export)

      .command('import <file>', '导入 View 定义', (yargs) => {
        yargs.positional('file', { type: 'string', description: 'JSON 文件路径' });
        yargs.option('id', { type: 'string', description: '覆盖导入的 View ID' });
      }, viewCmd.import)

      .demandCommand(1, '请指定 View 子命令。可用: create, list, show, update, rm, run, export, import');
  })

  .command('permission', '权限管理（Phase 6.4）', (yargs) => {
    yargs
      .command('role', '角色管理', (yargs) => {
        yargs
          .command('list', '列出角色', {}, graphCmd.permissionRoleList)
          .demandCommand(1, '请指定角色子命令。可用: list');
      }, () => {})

      .command('check <subject> <action>', '检查权限', (yargs) => {
        yargs.positional('subject', { type: 'string', description: '主体（如 current-user）' });
        yargs.positional('action', { type: 'string', description: '权限（如 resource.read）' });
        yargs.option('resource', { type: 'string', description: '资源 RID（可选）' });
      }, graphCmd.permissionCheck)

      .command('grant <subject> <action>', '授予权限', (yargs) => {
        yargs.positional('subject', { type: 'string', description: '主体' });
        yargs.positional('action', { type: 'string', description: '权限代码' });
      }, graphCmd.permissionGrant)

      .command('audit', '权限审计日志', {}, graphCmd.permissionAudit)

      .demandCommand(1, '请指定权限子命令。可用: role, check, grant, audit');
  })

  .command('security', '安全系统（Phase 6.9）', (yargs) => {
    yargs
      .command('identity', '身份管理', (yargs) => {
        yargs
          .command('list', '列出身份', {}, securityCmd.identityList)
          .command('create <type> <id> [name]', '创建身份', (yargs) => {
            yargs.positional('type', { type: 'string', description: '身份类型（user/agent/plugin/workflow/service）' });
            yargs.positional('id', { type: 'string', description: '身份 ID' });
            yargs.positional('name', { type: 'string', description: '名称（可选）' });
          }, securityCmd.identityCreate)
          .demandCommand(1, '请指定 identity 子命令。可用: list, create');
      })

      .command('check <subject> <action>', '权限检查', (yargs) => {
        yargs.positional('subject', { type: 'string', description: '主体' });
        yargs.positional('action', { type: 'string', description: '权限代码（如 resource.read）' });
        yargs.option('resource', { alias: 'r', type: 'string', description: '资源 RID（可选）' });
      }, securityCmd.checkPermission)

      .command('policy', '策略管理', (yargs) => {
        yargs
          .command('list', '列出策略', {}, securityCmd.policyList)
          .demandCommand(1, '请指定 policy 子命令。可用: list');
      })

      .command('audit', '安全审计', (yargs) => {
        yargs.option('actor', { type: 'string', description: '按操作者过滤' });
        yargs.option('limit', { type: 'number', description: '返回条数（默认 30）' });
      }, securityCmd.securityAudit)

      .demandCommand(1, '请指定 security 子命令。可用: identity, check, policy, audit');
  })

  .command('agent', '知识智能体（Phase 6.5）', (yargs) => {
    yargs
      .command('list', '列出 Agent', {}, graphCmd.agentList)
      .command('info <id>', 'Agent 详情', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Agent ID' });
      }, graphCmd.agentInfo)
      .command('run <id>', '执行 Agent', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Agent ID' });
        yargs.option('goal', { type: 'string', description: '执行目标' });
      }, graphCmd.agentRun)
      .command('memory <id>', '查看 Agent 记忆', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Agent ID' });
        yargs.option('limit', { type: 'number', description: '数量限制', default: 10 });
      }, graphCmd.agentMemory)
      .command('messages', '查看 Agent 消息', (yargs) => {
        yargs.option('agentId', { type: 'string', description: 'Agent ID 过滤' });
        yargs.option('limit', { type: 'number', description: '数量限制', default: 15 });
      }, graphCmd.agentMessages)
      .command('send <from> <to> <message>', '发送 Agent 消息', (yargs) => {
        yargs.positional('from', { type: 'string', description: '发送方' });
        yargs.positional('to', { type: 'string', description: '接收方' });
        yargs.positional('message', { type: 'string', description: '消息内容' });
      }, graphCmd.agentSend)
      .demandCommand(1, '请指定 Agent 子命令。可用: list, info, run, memory, messages, send');
  })

  .command('team', 'Agent 团队协作（Phase 6.6）', (yargs) => {
    yargs
      .command('list', '列出 Agent 团队', {}, graphCmd.teamList)
      .command('run <id> <goal>', '执行团队协作任务', (yargs) => {
        yargs.positional('id', { type: 'string', description: 'Team ID' });
        yargs.positional('goal', { type: 'string', description: '协作目标' });
      }, graphCmd.teamRun)
      .demandCommand(1, '请指定团队子命令。可用: list, run');
  })

  .command('ai', 'AI 原生知识操作系统（Phase 6.7）', (yargs) => {
    yargs
      .command('status', '查看 AI OS 状态', {}, graphCmd.aiStatus)
      .command('ask <question>', '向 AI 提问', (yargs) => {
        yargs.positional('question', { type: 'string', description: '问题' });
        yargs.option('mode', { type: 'string', description: '模式: chat/analysis/research/creation/automation', default: 'chat' });
      }, graphCmd.aiAsk)
      .command('analyze', '分析知识图谱', {}, graphCmd.aiAnalyze)
      .command('insights', '查看 AI 洞察', {}, graphCmd.aiInsights)
      .command('memory', '查看 AI 记忆', {}, graphCmd.aiMemory)
      .demandCommand(1, '请指定 AI 子命令。可用: status, ask, analyze, insights, memory');
  })

  .command('evolution', '知识系统自演化（Phase 6.8）', (yargs) => {
    yargs
      .command('status', '查看进化状态', {}, graphCmd.evoStatus)
      .command('analyze', '分析系统并诊断问题', {}, graphCmd.evoAnalyze)
      .command('run', '执行自我改进循环', {}, graphCmd.evoRun)
      .command('history', '查看进化历史', {}, graphCmd.evoHistory)
      .demandCommand(1, '请指定 Evolution 子命令。可用: status, analyze, run, history');
  })

  .command('runtime', 'Knowledge Runtime（Phase 6.10）', (yargs) => {
    yargs
      .command('status', '查看 Runtime 状态', {}, runtimeCmd.runtimeStatus)
      .command('start', '启动 Runtime', {}, runtimeCmd.runtimeStart)
      .command('stop', '停止 Runtime', {}, runtimeCmd.runtimeStop)
      .command('monitor', '监控面板', {}, runtimeCmd.runtimeMonitor)
      .command('evolve', '知识演化建议', {}, runtimeCmd.runtimeEvolve)
      .demandCommand(1, '请指定 Runtime 子命令。可用: status, start, stop, monitor, evolve');
  })

  .command('container', '容器管理（提升/降级、状态、扫描、同步、列表、成员、忽略）', (yargs) => {
    yargs
      .command('promote [path]', '提升容器成员为独立 Resource（--revert 降级）', (yargs) => {
        yargs
          .positional('path', {
            type: 'string',
            description: '要操作的文件路径'
          })
          .option('container', {
            type: 'string',
            alias: 'c',
            description: '容器名称或 RID（不指定则自动查找）'
          })
          .option('type', {
            type: 'string',
            alias: 't',
            description: 'Resource 类型（仅提升时生效，默认根据文件扩展名推导）'
          })
          .option('revert', {
            type: 'boolean',
            alias: 'r',
            description: '降级：将已提升成员恢复为普通文件成员',
            default: false
          });
      }, containerCmd.promote)

      .command('status [containerId]', '查看容器成员变更状态（对比文件系统与数据库）', (yargs) => {
        yargs
          .positional('containerId', {
            type: 'string',
            description: '容器名称或 RID'
          });
      }, containerCmd.status)

      .command('scan [containerId]', '扫描容器成员（添加新文件）', (yargs) => {
        yargs
          .positional('containerId', {
            type: 'string',
            description: '容器名称或 RID'
          });
      }, containerCmd.scan)

      .command('sync [containerId]', '同步容器成员（diff + 应用变更：新增/修改/删除）', (yargs) => {
        yargs
          .positional('containerId', {
            type: 'string',
            description: '容器名称或 RID'
          })
          .option('dry-run', {
            type: 'boolean',
            alias: 'n',
            description: '仅预览变更，不实际修改数据库',
            default: false
          });
      }, containerCmd.sync)

      .command('list [containerId]', '列出容器所有成员', (yargs) => {
        yargs
          .positional('containerId', {
            type: 'string',
            description: '容器名称或 RID'
          })
          .option('resources', {
            type: 'boolean',
            description: '仅显示已提升为 Resource 的成员',
            default: false
          })
          .option('files', {
            type: 'boolean',
            description: '仅显示未提升的普通文件成员',
            default: false
          });
      }, containerCmd.list)

      .command('members [containerId]', '列出容器成员（带状态图标：promoted/indexed/force-ignored/deleted）', (yargs) => {
        yargs
          .positional('containerId', {
            type: 'string',
            description: '容器名称或 RID'
          })
          .option('promoted', {
            type: 'boolean',
            description: '仅显示已提升成员',
            default: false
          })
          .option('indexed', {
            type: 'boolean',
            description: '仅显示未提升的普通成员',
            default: false
          });
      }, containerCmd.members)

      .command('config [containerId]', '查看容器同步配置（source / sync_mode / delete_policy）', (yargs) => {
        yargs
          .positional('containerId', {
            type: 'string',
            description: '容器名称或 RID'
          });
      }, containerCmd.config)

      .command('ignore [path]', '强制忽略容器成员（设置 force_ignore 标志）', (yargs) => {
        yargs
          .positional('path', {
            type: 'string',
            description: '要忽略的文件路径'
          })
          .option('container', {
            type: 'string',
            alias: 'c',
            description: '容器名称或 RID（不指定则自动查找）'
          })
          .option('source', {
            type: 'number',
            alias: 's',
            description: 'Content Source ID（多 source 时指定）'
          });
      }, containerCmd.ignore)

      .command('unignore [path]', '取消忽略容器成员', (yargs) => {
        yargs
          .positional('path', {
            type: 'string',
            description: '要取消忽略的文件路径'
          })
          .option('container', {
            type: 'string',
            alias: 'c',
            description: '容器名称或 RID（不指定则自动查找）'
          })
          .option('source', {
            type: 'number',
            alias: 's',
            description: 'Content Source ID（多 source 时指定）'
          });
      }, containerCmd.unignore)

      // ── Phase 4.1: lo container member <action> ──
      .command('member', '成员操作（rename/remove/restore/move/copy）', (yargs) => {
        yargs
          .command('rename <path> <newpath>', '重命名成员路径', (yargs) => {
            yargs
              .positional('path', { type: 'string', description: '当前成员路径' })
              .positional('newpath', { type: 'string', description: '新路径' })
              .option('container', { type: 'string', alias: 'c', description: '容器名称或 RID' });
          }, containerCmd.memberRename)

          .command('remove <path>', '软删除成员（status→deleted）', (yargs) => {
            yargs
              .positional('path', { type: 'string', description: '成员路径' })
              .option('container', { type: 'string', alias: 'c', description: '容器名称或 RID' });
          }, containerCmd.memberRemove)

          .command('restore <path>', '恢复已删除的成员', (yargs) => {
            yargs
              .positional('path', { type: 'string', description: '成员路径' })
              .option('container', { type: 'string', alias: 'c', description: '容器名称或 RID' });
          }, containerCmd.memberRestore)

          .command('move <path> <target>', '移动成员到另一个容器', (yargs) => {
            yargs
              .positional('path', { type: 'string', description: '成员路径' })
              .positional('target', { type: 'string', description: '目标容器名称或 RID' })
              .option('container', { type: 'string', alias: 'c', description: '源容器名称或 RID' });
          }, containerCmd.memberMove)

          .command('copy <path> <target>', '复制成员到另一个容器', (yargs) => {
            yargs
              .positional('path', { type: 'string', description: '成员路径' })
              .positional('target', { type: 'string', description: '目标容器名称或 RID' })
              .option('container', { type: 'string', alias: 'c', description: '源容器名称或 RID' });
          }, containerCmd.memberCopy)

          .command('history <path>', '查看成员操作历史', (yargs) => {
            yargs
              .positional('path', { type: 'string', description: '成员路径' })
              .option('container', { type: 'string', alias: 'c', description: '容器名称或 RID' });
          }, containerCmd.memberHistory)

          .demandCommand(1, '请指定成员操作。可用: rename, remove, restore, move, copy, history');
      })

      .command('history', '查看容器操作时间线', (yargs) => {
        yargs
          .option('container', { type: 'string', alias: 'c', description: '容器名称或 RID' })
          .option('limit', { type: 'number', default: 50, description: '显示条数' });
      }, containerCmd.containerHistory)

      .command('transaction', '事务管理（list/show/undo）', (yargs) => {
        yargs
          .command('list <container>', '列出容器的事务', (yargs) => {
            yargs
              .positional('container', { type: 'string', description: '容器名称或 RID' })
              .option('limit', { type: 'number', default: 50, description: '显示条数' });
          }, containerCmd.transactionList)

          .command('show <transaction>', '查看事务详情', (yargs) => {
            yargs
              .positional('transaction', { type: 'string', description: '事务 ID (tx_xxx)' });
          }, containerCmd.transactionShow)

          .command('undo <transaction>', '回滚事务（逆序撤销所有操作）', (yargs) => {
            yargs
              .positional('transaction', { type: 'string', description: '事务 ID (tx_xxx)' });
          }, containerCmd.transactionUndo)

          .demandCommand(1, '请指定事务操作。可用: list, show, undo');
      })

      .command('verify <container>', '检查容器数据一致性（Member/Operation/Transaction）', (yargs) => {
        yargs
          .positional('container', { type: 'string', description: '容器名称或 RID' });
      }, containerCmd.verify)

      .demandCommand(1, '请指定容器子命令。可用: promote, status, scan, sync, list, members, config, ignore, unignore, member, history, transaction, verify');
  })

  .command('commit', '提交暂存区到仓库', (yargs) => {
    yargs
      .option('message', {
        type: 'string',
        alias: 'm',
        description: '提交信息'
      })
      .option('merge', {
        type: 'boolean',
        description: '标记为合并提交（自动检测，也可手动指定）'
      });
  }, commit)

  // Phase 4.2: undo container operation
  .command('undo <operation>', '撤销容器操作', (yargs) => {
    yargs
      .positional('operation', {
        type: 'string',
        description: '操作 ID（通过 lo container member history 查看）'
      });
  }, containerCmd.undo)

  .command('reset [path]', '取消暂存或清空暂存区', (yargs) => {
    yargs
      .positional('path', {
        type: 'string',
        description: '文件路径，使用 HEAD 清空所有'
      });
  }, reset)

  .command('log', '查看提交历史', (yargs) => {
    yargs
      .option('limit', {
        type: 'number',
        alias: 'n',
        description: '显示数量限制',
        default: 20
      });
  }, log)

  .command('stack [action] [rid]', '管理同名资源栈（同名冲突的冗余副本）', (yargs) => {
    yargs
      .positional('action', {
        type: 'string',
        description: '栈操作',
        choices: ['list', 'promote', 'remove']
      })
      .positional('rid', {
        type: 'string',
        description: '资源 RID（用于 promote / remove）'
      });
  }, stack)

  .command('auth <action>', '管理 SSH 身份认证（支持多设备）', (yargs) => {
    yargs
      .positional('action', {
        type: 'string',
        description: '认证操作',
        choices: ['add', 'enable', 'remove', 'list', 'disable', 'status', 'verify', 'keys']
      })
      .option('key-path', {
        type: 'string',
        alias: 'k',
        description: 'SSH 公钥路径（用于 add）'
      })
      .option('label', {
        type: 'string',
        alias: 'l',
        description: '密钥标签，如"笔记本"、"台式机"（用于 add）'
      })
      .option('fingerprint', {
        type: 'string',
        alias: 'f',
        description: '密钥指纹（用于 remove）'
      })
      .option('ttl', {
        type: 'number',
        description: '认证会话有效期（分钟，默认 15）',
        default: 15
      });
  }, auth)
  
  .command('serve', '启动本地 HTTP API 服务', (yargs) => {
    yargs
      .option('port', {
        type: 'number',
        alias: 'p',
        description: '监听端口',
        default: 8765
      })
      .option('repo', {
        type: 'string',
        alias: 'r',
        description: '仓库路径',
        default: process.cwd()
      })
      .option('admin-token', {
        type: 'string',
        description: 'Admin API 共享密钥（也可通过 LO_ADMIN_TOKEN 环境变量设置）'
      })
      .option('watch', {
        type: 'boolean',
        description: '启用 FileWatcher（监听 resources/ 目录，外部改文件自动同步派生关系）',
        default: true
      });
  }, serve)

  .command('admin', '启动管理后台（lo serve + Admin SPA）', (yargs) => {
    yargs
      .option('port', {
        type: 'number',
        alias: 'p',
        description: '监听端口',
        default: 8765
      })
      .option('repo', {
        type: 'string',
        alias: 'r',
        description: '仓库路径',
        default: process.cwd()
      });
  }, graphCmd.admin)

  .command('operation', '操作管理', (yargs) => {
    yargs
      .command('types', '列出所有已注册的操作类型', {}, async (argv) => {
        const Repository = require('./repo/repository.cjs');
        const repo = new Repository(process.cwd());
        await repo.open({ skipAuth: true });
        const types = repo.getOperationTypes();
        console.log(chalk.bold.cyan('\n  Registered Operations:\n'));
        for (const t of types) {
          console.log(`  ${chalk.gray('·')} ${chalk.cyan(t)}`);
        }
        console.log(chalk.gray(`\n  ${types.length} types total`));
        console.log('');
        await repo.close();
        process.exit(0);
      })
      .demandCommand(1, '请指定操作子命令。可用: types');
  })

  // ── 扩展命令分发（来自插件的 commands 扩展点）──
  .command('ext [name] [args..]', '调用插件扩展命令', (yargs) => {
    yargs
      .positional('name', { type: 'string', description: '扩展命令名' })
      .positional('args', { type: 'string', array: true, description: '命令参数' })
      .option('list', { type: 'boolean', description: '列出所有可用扩展命令', default: false });
  }, async (argv) => {
    const Repository = require('./repo/repository.cjs');
    const repo = new Repository(process.cwd());
    let exitCode = 0;
    try {
      await repo.open({ skipAuth: true });
      await repo.initPluginSystem();
      const extRegistry = repo.getPluginExtensionRegistry();
      // 过滤 HTTP 端点（{method,path,handler} 结构），只列出可运行的 CLI 命令
      const cmds = (extRegistry.list('commands') || []).filter(c => isCliCommand(c.handler));

      if (argv.list || !argv.name) {
        console.log(chalk.bold.cyan('\n  Extension Commands'));
        console.log(chalk.gray('  ───────────────────────────────\n'));
        if (cmds.length === 0) {
          console.log(chalk.gray('  No extension commands registered.'));
        } else {
          for (const c of cmds) {
            const desc = c.handler && c.handler.description ? ` — ${c.handler.description}` : '';
            console.log(`  ${chalk.cyan(c.key.padEnd(20))} ${chalk.gray(`[${c.pluginId}]`)}${desc}`);
          }
        }
        console.log('');
        return;
      }

      const entry = cmds.find(c => c.key === argv.name);
      if (!entry) {
        console.error(chalk.red(`\n  Extension command '${argv.name}' not found.\n`));
        console.log(chalk.gray(`  Available: ${cmds.map(c => c.key).join(', ') || '(none)'}\n`));
        exitCode = 1;
        return;
      }

      const runFn = typeof entry.handler === 'function' ? entry.handler : entry.handler.run;
      if (typeof runFn !== 'function') {
        console.error(chalk.red(`\n  Extension command '${argv.name}' 缺少 run(args, ctx) 函数.\n`));
        exitCode = 1;
        return;
      }

      const cmdArgs = argv.args || [];
      // 收敛：不再把裸 Repository 塞给插件命令，而是注入该插件自己的 PluginContext facade
      // （仅暴露 ctx.resources / ctx.relations / ctx.config / ctx.repoPath / ctx.logger）
      const ctx = repo.getPluginManager().getContext(entry.pluginId);
      if (!ctx) {
        console.error(chalk.red(`\n  插件 '${entry.pluginId}' 未加载，无法提供上下文。\n`));
        exitCode = 1;
        return;
      }
      await runFn(cmdArgs, ctx);
    } catch (e) {
      console.error(chalk.red('Error:'), e.message);
      exitCode = 1;
    } finally {
      try { await repo.close(); } catch { /* ignore */ }
      process.exit(exitCode);
    }
  });

cli.fail((msg, err, yargs) => {
  // 同步标记：任何 fail 都由本处理器负责最终退出，
  // parse 回调据此不再 process.exit，避免与异步分发竞争。
  failHandled = true;
  if (err) {
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
    return;
  }
  if (!msg) {
    process.exit(1);
    return;
  }
  // 未知命令兜底：尝试从已加载插件扩展点查找
  // 借助 exitProcess(false)，此 IIFE 的 process.exit 不会与 yargs 默认退出竞争
  const rawArgv = process.argv.slice(2);
  // 仅当首 token 是未注册的顶层命令时才视为"未知命令"；
  // 已注册命令的 fail（如缺失子命令）应走默认提示而非扩展分发。
  let knownTopCommands = [];
  try {
    knownTopCommands = cli.getInternalMethods().getCommandInstance().getCommands();
  } catch { /* 无法枚举命令列表时回退为空，交由默认提示处理 */ }
  const isUnknownCmd = rawArgv.length > 0 && /^[a-zA-Z][\w-]*$/.test(rawArgv[0])
    && !/^(--|-|\/)/.test(rawArgv[0])
    && !knownTopCommands.includes(rawArgv[0]);

  if (isUnknownCmd) {
    (async () => {
      const dispatched = await dispatchExtensionCommandSafe(rawArgv[0], rawArgv.slice(1));
      if (dispatched) {
        process.exit(0);
        return;
      }
      // 没找到或仓库不存在，回退到默认未知命令提示
      console.error(chalk.red('Error:'), msg);
      yargs.showHelp();
      process.exit(1);
    })();
    return;
  }
  console.error(chalk.red('Error:'), msg);
  yargs.showHelp();
  process.exit(1);
});

/**
 * 从插件扩展点 commands 查找并分发命令（安全版）
 *
 * 返回值语义：
 *   true  — 找到扩展命令并成功执行
 *   false — 未找到扩展命令（或非仓库目录、仓库打不开等），回退到 yargs 默认提示
 *
 * 如果找到扩展命令但执行抛错，会打印错误信息并 process.exit(1)，
 * 不会回退到 "Unknown command" 提示。
 *
 * @param {string} name — 命令名
 * @param {string[]} args — 命令参数
 * @returns {Promise<boolean>}
 */
async function dispatchExtensionCommandSafe(name, args) {
  let repo = null;
  let opened = false;
  let runFnFound = false;  // 标记：是否找到了可执行的 runFn

  try {
    const cwd = process.cwd();
    if (!fs.existsSync(path.join(cwd, '.repo'))) return false;

    const Repository = require('./repo/repository.cjs');
    repo = new Repository(cwd);
    try {
      await repo.open({ skipAuth: true });
      opened = true;
    } catch {
      return false;  // 仓库打不开，静默回退
    }

    try {
      await repo.initPluginSystem();
    } catch {
      // 插件系统初始化失败也不影响兜底查找
    }

    const extRegistry = repo.getPluginExtensionRegistry();
    const handler = extRegistry.get('commands', name);
    if (!handler) return false;

    const runFn = typeof handler === 'function' ? handler : handler.run;
    if (typeof runFn !== 'function') return false;

    // ── 到这里说明找到了可执行的扩展命令 ──
    runFnFound = true;
    // 收敛：不把裸 Repository 传给插件命令，而是注入该插件自己的 PluginContext facade
    const entry = (extRegistry.list('commands') || []).find(c => c.key === name);
    const ctx = entry ? repo.getPluginManager().getContext(entry.pluginId) : null;
    if (!ctx) {
      console.error(chalk.red('Error:'), `插件 '${entry ? entry.pluginId : '?'}' 未加载，无法提供上下文。`);
      process.exit(1);
    }
    await runFn(args, ctx);
    return true;
  } catch (e) {
    if (runFnFound) {
      // 扩展命令执行失败：显示真实错误，以退出码 1 退出
      console.error(chalk.red('Error:'), e.message);
      process.exit(1);
    }
    // 设置阶段失败（repo.open / initPluginSystem 等），静默回退
    return false;
  } finally {
    if (opened) {
      try { await repo.close(); } catch { /* ignore */ }
    }
  }
}

const args = process.argv.slice(2);

if (args[0] === 'help') {
  help({});
  process.exit(0);
}

// fail 处理器是否已接管（由 failHandled 同步置位）。
// 一旦置位，最终退出交给 fail 处理器完成（可能为异步分发），
// 解析回调不再主动 process.exit，避免在分发完成前以错误码 0 退出。
let failHandled = false;

// 带回调解析：yargs 在 exitProcess(false) 下不会主动退出。
// 这里只兜底两类"handler 未自行退出"的场景：
//   1) --help/-h/--version 等内置输出（output 由回调返回）
//   2) 解析失败（err）
// 长驻命令（serve/admin/docs-serve 等）与其余命令由其 handler 自行调用
// process.exit（或持续运行），回调不强制退出，避免误杀服务进程。
cli.parse(args, (err, argv, output) => {
  if (output) process.stdout.write(output);
  if (failHandled) return;
  if (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error(chalk.red('Error:'), msg);
    process.exit(1);
    return;
  }
  if (argv.help || argv.version) {
    process.exit(0);
  }
});

module.exports = cli;