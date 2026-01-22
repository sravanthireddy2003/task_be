const db = require('../src/db');

function q(sql, params=[]) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function main() {
  const projectParam = process.argv[2];
  const userParam = process.argv[3];
  if (!projectParam) {
    console.error('Usage: node scripts/check_project_documents.js <projectPublicId_or_id> [userPublicId_or_id]');
    process.exit(1);
  }

  try {
    const prow = await q('SELECT id, public_id, client_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectParam, projectParam]);
    if (!prow || prow.length === 0) {
      console.log('Project not found for', projectParam);
      process.exit(0);
    }
    const p = prow[0];
    console.log('Resolved project:', p);

    // Project docs
    const projectDocs = await q("SELECT documentId, fileName, entityType, entityId, filePath, mimeType, uploadedBy, createdAt FROM documents WHERE entityType = 'PROJECT' AND entityId IN (?, ?) ORDER BY createdAt DESC", [p.id, p.public_id]);
    console.log('Documents for project:', projectDocs.length);
    projectDocs.forEach(d => console.log('-', d.documentId, d.fileName, d.filePath, d.createdAt));

    // Tasks under project
    const tasks = await q('SELECT id, public_id FROM tasks WHERE project_id = ? OR project_public_id = ?', [p.id, p.public_id]);
    console.log('Tasks under project:', tasks.length);
    tasks.forEach(t => console.log('- Task:', t.id, t.public_id));

    // Task docs
    let taskDocs = [];
    if (tasks.length > 0) {
      const taskIds = tasks.map(t => t.id).concat(tasks.map(t => t.public_id).filter(Boolean));
      const placeholders = taskIds.map(() => '?').join(',');
      taskDocs = await q(`SELECT documentId, fileName, entityType, entityId FROM documents WHERE entityType = 'TASK' AND entityId IN (${placeholders}) ORDER BY createdAt DESC`, taskIds);
      console.log('Documents for tasks:', taskDocs.length);
      taskDocs.forEach(d => console.log('-', d.documentId, d.fileName, d.entityId));
    }

    // Client docs if no project/task docs
    let clientDocs = [];
    if ((projectDocs.length === 0 && taskDocs.length === 0) && p.client_id) {
      clientDocs = await q("SELECT documentId, fileName, entityType, entityId FROM documents WHERE entityType = 'CLIENT' AND entityId = ? ORDER BY createdAt DESC", [p.client_id]);
      console.log('Fallback client documents:', clientDocs.length);
      clientDocs.forEach(d => console.log('-', d.documentId, d.fileName));
    }

    const allDocs = projectDocs.concat(taskDocs).concat(clientDocs);
    console.log('Total documents to return:', allDocs.length);

    if (allDocs.length > 0) {
      const docIds = allDocs.map(d => d.documentId);
      const placeholders = docIds.map(() => '?').join(',');
      const accRows = await q(`SELECT id as accessId, documentId, userId, accessType as permissionLevel, grantedBy, grantedAt FROM document_access WHERE documentId IN (${placeholders})`, docIds);
      console.log('Document access rows:', accRows.length);
      accRows.forEach(a => console.log('-', a.documentId, a.userId, a.permissionLevel));
    }

    if (userParam) {
      const urows = await q('SELECT _id, public_id, name, role FROM users WHERE _id = ? OR public_id = ? LIMIT 1', [userParam, userParam]);
      if (!urows || urows.length === 0) {
        console.log('User not found for', userParam);
      } else {
        console.log('User resolved:', urows[0]);
        if (allDocs.length > 0) {
          for (const d of allDocs) {
            const ar = await q('SELECT * FROM document_access WHERE documentId = ? AND (userId = ? OR userId = ?) LIMIT 1', [d.documentId, urows[0]._id, urows[0].public_id]);
            console.log('Access for', d.documentId, '-', ar && ar.length ? ar[0].permissionLevel : 'none');
          }
        }
      }
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(2);
  }
}

main();
