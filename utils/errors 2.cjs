const { Prisma } = require('@prisma/client');

function logError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`Prisma error ${err.code}: ${err.message}`);
  } else if (process.env.NODE_ENV === 'production') {
    console.error(err.message);
  } else {
    console.error(err);
  }
}

module.exports = { logError };
