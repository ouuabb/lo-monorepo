class QueryEngine {
  constructor(db) {
    this.db = db;
  }

  async queryResources(options = {}) {
    const { type, limit, offset, sortBy = 'created', sortOrder = 'DESC' } = options;
    
    let sql = 'SELECT * FROM resources WHERE deleted = 0';
    const params = [];
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    
    sql += ` ORDER BY ${sortBy} ${sortOrder}`;
    
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    
    if (offset) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
    
    const rows = await this.db.all(sql, params);
    return rows.map(row => this._hydrate(row));
  }

  async queryUnreferenced() {
    const rows = await this.db.all(`
      SELECT r.* FROM resources r
      LEFT JOIN relations rel ON r.rid = rel.to_rid
      WHERE r.deleted = 0 AND rel.id IS NULL
    `);
    
    return rows.map(row => this._hydrate(row));
  }

  async queryRecent(count = 20) {
    return this.queryResources({
      limit: count,
      sortBy: 'created',
      sortOrder: 'DESC'
    });
  }

  async queryByType(type) {
    return this.queryResources({ type });
  }

  async queryByPathPattern(pattern) {
    const rows = await this.db.all(`
      SELECT * FROM resources WHERE deleted = 0 AND path LIKE ?
    `, [`%${pattern}%`]);
    
    return rows.map(row => this._hydrate(row));
  }

  async queryByName(name) {
    const row = await this.db.get(`
      SELECT * FROM resources WHERE name = ? AND deleted = 0
    `, [name]);
    
    return row ? this._hydrate(row) : null;
  }

  async queryByNamePattern(pattern) {
    const rows = await this.db.all(`
      SELECT * FROM resources WHERE deleted = 0 AND name LIKE ?
    `, [`%${pattern}%`]);
    
    return rows.map(row => this._hydrate(row));
  }

  async search(query) {
    const escaped = query.replace(/'/g, "''");
    
    const rows = await this.db.all(`
      SELECT * FROM resources 
      WHERE deleted = 0 AND (
        name LIKE '%${escaped}%' OR
        metadata LIKE '%${escaped}%' OR
        path LIKE '%${escaped}%'
      )
      ORDER BY created DESC
      LIMIT 20
    `);
    
    return rows.map(row => this._hydrate(row));
  }

  async getGraph(rid) {
    const outgoing = await this.db.all(`
      SELECT r.*, rel.type as relation_type 
      FROM relations rel
      JOIN resources r ON rel.to_rid = r.rid
      WHERE rel.from_rid = ? AND r.deleted = 0
    `, [rid]);
    
    const incoming = await this.db.all(`
      SELECT r.*, rel.type as relation_type
      FROM relations rel
      JOIN resources r ON rel.from_rid = r.rid
      WHERE rel.to_rid = ? AND r.deleted = 0
    `, [rid]);
    
    return {
      outgoing: outgoing.map(row => this._hydrate(row)),
      incoming: incoming.map(row => this._hydrate(row))
    };
  }

  async getStats() {
    const total = await this.db.get(`SELECT COUNT(*) as count FROM resources WHERE deleted = 0`);
    
    const byType = await this.db.all(`
      SELECT type, COUNT(*) as count 
      FROM resources 
      WHERE deleted = 0 
      GROUP BY type
    `);
    
    const totalRelations = await this.db.get(`SELECT COUNT(*) as count FROM relations`);
    
    const recent = await this.db.get(`
      SELECT MAX(created) as latest FROM resources WHERE deleted = 0
    `);
    
    return {
      totalResources: total.count,
      resourcesByType: byType,
      totalRelations: totalRelations.count,
      latestActivity: recent.latest
    };
  }

  _hydrate(row) {
    return {
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    };
  }
}

module.exports = QueryEngine;