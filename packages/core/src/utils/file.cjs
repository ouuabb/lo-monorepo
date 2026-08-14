const fs = require('fs-extra');
const path = require('path');

class FileUtils {
  static async exists(filePath) {
    return fs.pathExists(filePath);
  }
  
  static async read(filePath) {
    if (!await this.exists(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    return fs.readFile(filePath, 'utf-8');
  }
  
  static async write(filePath, content) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  }
  
  static async copy(src, dest) {
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(src, dest);
  }
  
  static async move(src, dest) {
    await fs.ensureDir(path.dirname(dest));
    await fs.move(src, dest);
  }
  
  static async remove(filePath) {
    if (await this.exists(filePath)) {
      await fs.remove(filePath);
    }
  }
  
  static getExtension(filePath) {
    return path.extname(filePath);
  }
  
  static getBasename(filePath) {
    return path.basename(filePath, this.getExtension(filePath));
  }
  
  static getDirname(filePath) {
    return path.dirname(filePath);
  }
  
  static join(...paths) {
    return path.join(...paths);
  }
}

module.exports = FileUtils;