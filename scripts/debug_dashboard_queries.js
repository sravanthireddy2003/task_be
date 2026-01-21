const db = require(__dirname + '/../src/db');

function q(sql, params=[]) { return new Promise((resolve, reject) => db.query(sql, params, (e, rows) => e ? reject(e) : resolve(rows))); }

async function run() {
  try {
    console.log('Testing dashboard queries...');
    const queries = [
      {name:'totalClients', sql: "SELECT COUNT(*) as c FROM clientss WHERE isDeleted IS NULL OR isDeleted != 1"},
      {name:'totalTasks', sql: "SELECT COUNT(*) as c FROM tasks"},
      {name:'pendingTasks', sql: "SELECT COUNT(*) as c FROM tasks WHERE LOWER(status) IN ('pending', 'not started')"},
      {name:'overdueTasks', sql: "SELECT COUNT(*) as c FROM tasks WHERE due_date < CURDATE() AND LOWER(status) != 'completed'"},
      {name:'completedToday', sql: "SELECT COUNT(*) as c FROM tasks WHERE DATE(completed_at) = CURDATE() AND LOWER(status) = 'completed'"},
      {name:'activeProjects', sql: "SELECT COUNT(DISTINCT project_id) as c FROM tasks WHERE DATE(taskDate) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"},
      {name:'taskStatusRows', sql: "SELECT LOWER(status) as s, COUNT(*) as c FROM tasks GROUP BY status"},
      {name:'weeklyRows', sql: "SELECT DATE(createdAt) as day, COUNT(*) as tasks FROM tasks WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(createdAt) ORDER BY day"},
      {name:'employeeRows', sql: `SELECT u.name, COUNT(CASE WHEN LOWER(t.status) = 'completed' THEN 1 END) as completed, COUNT(CASE WHEN LOWER(t.status) = 'in progress' THEN 1 END) as inProgress
        FROM users u
        LEFT JOIN taskassignments ta ON u._id = ta.user_id
        LEFT JOIN tasks t ON ta.task_id = t.id
        WHERE u.role = 'employee'
        GROUP BY u._id, u.name
        ORDER BY completed DESC, inProgress DESC
        LIMIT 4`},
      {name:'clientRows', sql: `SELECT c.name as client, COUNT(t.id) as tasks
        FROM clientss c
        LEFT JOIN projects p ON c.id = p.client_id
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE c.isDeleted IS NULL OR c.isDeleted != 1
        GROUP BY c.id, c.name
        ORDER BY tasks DESC
        LIMIT 4`},
      {name:'recentTasks', sql: "SELECT id, title, status, priority, due_date FROM tasks ORDER BY createdAt DESC LIMIT 1"},
      {name:'projectRows', sql: `SELECT p.id, p.name, COUNT(t.id) as tasks, c.name as client
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN clientss c ON p.client_id = c.id
        GROUP BY p.id, p.name, c.name
        HAVING tasks > 0
        LIMIT 1`} 
    ];

    for (const qitem of queries) {
      try {
        const rows = await q(qitem.sql);
        console.log(qitem.name + ': OK, rows=' + (Array.isArray(rows) ? rows.length : 0));
        // optionally print small sample
        if (Array.isArray(rows) && rows.length && rows.length <= 5) console.log(rows);
      } catch (e) {
        console.error('Query failed:', qitem.name, e && e.message);
      }
    }

    process.exit(0);
  } catch (e) {
    console.error('Fatal error', e && e.message);
    process.exit(1);
  }
}

run();