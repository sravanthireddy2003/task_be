const db = require('./src/db');

async function fix() {
    console.log('Fixing task 207 rejection reason...');
    const reason = "task details and have not completed properly plese do again";
    const userId = 56; // Manager ID from previous logs
    
    return new Promise((resolve) => {
        db.query(
            'UPDATE tasks SET status = "In Progress", rejected_by = ?, rejected_at = NOW(), rejection_reason = ? WHERE id = 207',
            [userId, reason],
            (err, results) => {
                if (err) console.error('Error:', err);
                else console.log('Fixed task 207:', results);
                
                db.query(
                   'UPDATE workflow_requests SET status = "REJECTED", rejection_reason = ?, rejected_at = NOW() WHERE entity_id = 207 AND entity_type = "TASK"',
                   [reason],
                   (err2, results2) => {
                       if (err2) console.error('Error workflow:', err2);
                       else console.log('Fixed workflow records:', results2);
                       resolve();
                   }
                )
            }
        );
    });
}

fix().then(() => process.exit());
