require('dotenv').config();
const app = require('../app');
function listRoutes(router, prefix=''){
  router.stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(`${methods} ${prefix}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const mountPath = layer.regexp && layer.regexp.source ? layer.regexp.source : '';
      listRoutes(layer.handle, prefix + mountPath.replace('^\\','').replace('\\/?(?=\\/|$)',''));
    }
  });
}
listRoutes(app);