/**
 * Zod request validation + async error handling.
 * Controllers declare a schema per route; unknown keys are stripped so a client
 * can never smuggle organizationId/userId/status into a payload.
 */
const { AppError } = require('../utils/errors');

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} source
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map(i => ({ field: i.path.join('.') || source, message: i.message }));
    return next(AppError.badRequest(details[0]?.message || 'Invalid request', details));
  }
  // req.query is a getter in Express 5 — store parsed output alongside.
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  return next();
};

module.exports = { validate };
