const db = require(__root + 'db');

module.exports = {
  getDashboard: async (req, res) => {
    try {
      const q = (sql, params=[]) => new Promise((r, rej) => db.query(sql, params, (e, rows) => e ? rej(e) : r(rows)));
      const users = (await q('SELECT COUNT(*) as c FROM users'))[0].c || 0;
      const projects = (await q('SELECT COUNT(*) as c FROM projects')).length ? (await q('SELECT COUNT(*) as c FROM projects'))[0].c : 0;
      const tasks = (await q('SELECT COUNT(*) as c FROM tasks')).length ? (await q('SELECT COUNT(*) as c FROM tasks'))[0].c : 0;
      return res.json({ success: true, data: { users, projects, tasks } });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  },

  manageUsers: async (req, res) => {
    db.query('SELECT _id, name, email, role, isActive, tenant_id FROM users', [], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: rows });
    });
  },

  manageClients: async (req, res) => {
    db.query('SELECT id, name, email, company, tenant_id FROM clients', [], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: rows });
    });
  },

  manageDepartments: async (req, res) => {
    db.query('SELECT id, name, tenant_id FROM departments', [], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: rows });
    });
  },

  manageProjects: async (req, res) => {
    db.query('SELECT id, name, description, tenant_id FROM projects', [], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: rows });
    });
  },

  manageTasks: async (req, res) => {
    db.query('SELECT id, title, description, status, assigned_to, tenant_id FROM tasks', [], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: rows });
    });
  }
};
