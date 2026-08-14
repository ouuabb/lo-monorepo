const path = require('path');

const TYPE_MAP = {
  '.md': 'note',
  '.pdf': 'pdf',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.html': 'html',
  '.htm': 'html',
  '.txt': 'text',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.csv': 'csv',
  '.xml': 'xml',
  '.py': 'code',
  '.js': 'code',
  '.jsx': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.java': 'code',
  '.cpp': 'code',
  '.c': 'code',
  '.h': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.ps1': 'code',
  '.toml': 'config',
  '.ini': 'config',
  '.cfg': 'config',
  '.env': 'config',
  '.parquet': 'data',
  '.doc': 'document',
  '.docx': 'document',
  '.xls': 'spreadsheet',
  '.xlsx': 'spreadsheet',
  '.ppt': 'presentation',
  '.pptx': 'presentation',
};

class ResourceType {
  static fromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return TYPE_MAP[ext] || 'unknown';
  }

  static isSupported(filePath) {
    return TYPE_MAP[path.extname(filePath).toLowerCase()] !== undefined;
  }

  static getExtensions(type) {
    return Object.entries(TYPE_MAP)
      .filter(([_, t]) => t === type)
      .map(([ext]) => ext);
  }
}

module.exports = ResourceType;