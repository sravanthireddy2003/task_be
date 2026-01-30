let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/db');
const q = (sql, params=[]) => new Promise((resolve,reject)=>db.query(sql, params, (e,r)=> e?reject(e):resolve(r)));
(async ()=>{
  try{
    const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workflow_logs' ORDER BY ORDINAL_POSITION");
    logger.info(rows.map(r=>r.COLUMN_NAME).join(', '));
    process.exit(0);
  }catch(e){logger.error(e);process.exit(1)}
})();
