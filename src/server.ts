import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`   SIJAGA LINGKUNGAN BACKEND IS RUNNING        `);
  console.log(`   Port   : http://localhost:${PORT}           `);
  console.log(`   Env    : ${process.env.NODE_ENV || 'development'}`);
  console.log(`===============================================`);
});
