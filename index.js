const app = require('./app');
const port = process.env.PORT || 4000;
const logger = require('./logger');

const server = app.listen(port, () => {
  const message = `Server is running on http://localhost:${port}`;
  logger.info(message); 
  console.log(message);
});
