const db = require('./src/db');

async function test() {
    console.log('Starting test...');
    try {
        const rows = await new Promise((resolve, reject) => {
            db.query('SELECT id, status, rejection_reason, rejected_by FROM tasks WHERE id = 207', (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        console.log('Tasks result:', JSON.stringify(rows, null, 2));

        const workflow = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM workflow_requests WHERE entity_id = 207', (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        console.log('Workflow result:', JSON.stringify(workflow, null, 2));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        // Since it's a pool, we should probably not use process.exit() 
        // until we're sure things are done, but here it's fine.
        process.exit();
    }
}

test();
