const chokidar = require("chokidar");

class FileWatcher {
  constructor(repoPath, onEvent) {
    this.repoPath = repoPath;
    this.onEvent = onEvent;
    this.watcher = null;
  }

  start() {
    if (this.watcher) {
      this.stop();
    }

    this.watcher = chokidar.watch(this.repoPath, {
      ignored: [/[\\/]\./, "node_modules", ".repo", "backups"],
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
    });

    this.watcher
      .on("add", (filePath) => {
        this._handleEvent("add", filePath);
      })
      .on("change", (filePath) => {
        this._handleEvent("change", filePath);
      })
      .on("unlink", (filePath) => {
        this._handleEvent("delete", filePath);
      })
      .on("addDir", (dirPath) => {
        this._handleEvent("addDir", dirPath);
      })
      .on("unlinkDir", (dirPath) => {
        this._handleEvent("deleteDir", dirPath);
      })
      .on("error", (error) => {
        console.error("Watcher error:", error);
      });

    return this;
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    return this;
  }

  _handleEvent(event, filePath) {
    if (typeof this.onEvent === "function") {
      this.onEvent({
        event,
        path: filePath,
        timestamp: Date.now(),
      });
    }
  }
}

module.exports = FileWatcher;
