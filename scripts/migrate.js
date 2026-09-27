require('../database/db').getDb().then(()=>console.log('数据库增量迁移完成，原有内容已保留')).catch(error=>{console.error(error.message);process.exitCode=1;});
