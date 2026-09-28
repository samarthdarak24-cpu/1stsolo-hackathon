/**
 * Organization routes. Everything except the join endpoints requires a session;
 * per-organization access is re-checked inside the services against the caller's
 * active organization membership.
 */
const express = require('express');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const s = require('../middleware/schemas');
const controller = require('../controllers/orgController');

const router = express.Router();

router.post('/create', protect, validate(s.createOrgSchema), controller.createOrganization);
router.post('/join', protect, validate(s.joinOrgSchema), controller.joinOrganization);
router.post('/join-code', protect, validate(s.joinOrgSchema), controller.joinOrganization);
router.get('/me/organizations', protect, controller.listMyOrganizations);
router.patch('/me/active-organization', protect, validate(s.setActiveOrgSchema), controller.setActiveOrganization);

router.get('/:id', protect, controller.getOrganization);
router.patch('/:id', protect, validate(s.updateOrgSchema), controller.updateOrganization);

router.get('/:id/settings', protect, controller.getSettings);
router.patch('/:id/settings', protect, validate(s.orgSettingsSchema), controller.updateSettings);
router.get('/:id/users', protect, controller.listUsers);
router.patch('/:id/users/:userId', protect, validate(s.updateRoleSchema), controller.updateUserRole);
router.post('/:id/invite', protect, validate(s.inviteSchema), controller.inviteUser);

module.exports = router;
