/**
 * Auth routes — public (rate limited) plus the authenticated session endpoints.
 */
const express = require('express');
const { protect, authLimiter } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const s = require('../middleware/schemas');
const controller = require('../controllers/authController');

const router = express.Router();

router.post('/check-domain', authLimiter, validate(s.loginSchema.pick({ email: true }), 'body'), controller.checkDomain);
router.post('/register', authLimiter, validate(s.registerSchema), controller.register);
router.post('/signup', authLimiter, validate(s.registerSchema), controller.register);
router.post('/login', authLimiter, validate(s.loginSchema), controller.login);
router.post('/signin', authLimiter, validate(s.loginSchema), controller.login);
router.post('/verify', authLimiter, validate(s.verifyEmailSchema), controller.verifyEmail);
router.post('/forgot-password', authLimiter, validate(s.forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate(s.resetPasswordSchema), controller.resetPassword);

router.get('/me', protect, controller.getMe);
router.patch('/switch-org', protect, validate(s.switchOrgSchema), controller.switchOrg);

module.exports = router;
