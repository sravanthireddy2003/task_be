const db = require(__dirname + '/../db');

function q(sql, params = []) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }

async function main() {
  const [,, projectPublicId, pmPublicId, deptCsv] = process.argv;
  if (!projectPublicId) { console.error('Usage: node backfill_project_relations.js <projectPublicId> <projectManagerPublicId?> <deptPubId1,deptPubId2,...?>'); process.exit(1); }
  try {
    const projectRows = await q('SELECT id, public_id, client_id FROM projects WHERE public_id = ? LIMIT 1', [projectPublicId]);
    if (!projectRows || projectRows.length === 0) { console.error('Project not found'); process.exit(1); }
    const project = projectRows[0];
    console.log('Found project', project.id, project.public_id);

    if (pmPublicId) {
      const urows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [pmPublicId]);
      if (!urows || urows.length === 0) { console.warn('Project manager user not found for', pmPublicId); } else {
        const uid = urows[0]._id;
        await q('UPDATE projects SET project_manager_id = ? WHERE id = ?', [uid, project.id]);
        console.log('Updated project_manager_id ->', uid);
      }
    }

    if (deptCsv) {
      const deps = deptCsv.split(',').map(s => s.trim()).filter(Boolean);
      for (const dpub of deps) {
        const drows = await q('SELECT id FROM departments WHERE public_id = ? LIMIT 1', [dpub]).catch(()=>[]);
        if (!drows || drows.length === 0) { console.warn('Department not found for', dpub); continue; }
        const did = drows[0].id;
        // insert if not exists
        const exist = await q('SELECT id FROM project_departments WHERE project_id = ? AND department_id = ? LIMIT 1', [project.id, did]);
        if (!exist || exist.length === 0) {
          await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', [project.id, did]);
          console.log('Linked department', did, '(', dpub, ') to project');
        } else {
          console.log('Department already linked', did, '(', dpub, ')');
        }
      }
    }

    // Show final departments
    const final = await q('SELECT pd.department_id, d.name, d.public_id FROM project_departments pd JOIN departments d ON pd.department_id = d.id WHERE pd.project_id = ?', [project.id]);
    console.log('Final departments:', JSON.stringify(final, null, 2));

    // Show updated project manager
    const p = await q('SELECT id, public_id, project_manager_id FROM projects WHERE id = ? LIMIT 1', [project.id]);
    console.log('Project row:', JSON.stringify(p && p[0], null, 2));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e && e.message);
    process.exit(1);
  }
}

main();
