/**
 * Auth middleware: JWT verification, per-request user hydration, and role guards.
 * The token carries only the user id; the full user (and their active
 * organization + memberships) is re-read on every request so revocations and
 * role changes take effect immediately.
 */
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getDriver } = require('../store');
const { AppError, asyncHandler } = require('../utils/errors');
const { FREE_DOMAINS } = require('../store/seed');
const config = require('../config');

const signToken = (userId) => jwt.sign({ id: userId }, config.jwt.secret, {
  expiresIn: config.jwt.expiresIn,
  issuer: config.jwt.issuer
});

const verifyToken = (token) => jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : null;
  // Browser EventSource cannot set request headers, so allow ?token= parameter as fallback
  if (!token && req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }
  if (!token) throw AppError.unauthorized('Not authenticated');

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    throw AppError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please sign in again' : 'Invalid session');
  }

  const user = await getDriver().findUserById(decoded.id);
  if (!user) throw AppError.unauthorized('This account no longer exists');

  req.user = user;
  next();
});

/** Requires one of the given roles in the user's ACTIVE organization. */
const roleRequired = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  const mem = (req.user.memberships || []).find(m => m.orgId === req.user.activeOrgId);
  if (!mem || !allowedRoles.includes(mem.role)) {
    return next(AppError.forbidden('Your role does not have access to this action'));
  }
  req.membership = mem;
  return next();
};

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' }
});

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down and try again shortly.' }
});

const isFreeEmailDomain = (email) => {
  const domain = String(email).split('@')[1]?.toLowerCase();
  return FREE_DOMAINS.includes(domain);
};

const extractDomain = (email) => String(email).split('@')[1]?.toLowerCase() || null;

module.exports = { protect, roleRequired, authLimiter, apiLimiter, signToken, verifyToken, isFreeEmailDomain, extractDomain };
