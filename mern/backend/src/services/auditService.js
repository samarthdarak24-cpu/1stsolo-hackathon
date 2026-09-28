/**
 * Audit service — every sensitive action is written here.
 * Failures are logged but never block the business action that triggered them.
 */
const { getDriver } = require('../store');

const audit = (req, { organizationId, action, entityType, entityId, metadata }) => {
  return getDriver().createAuditLog({
    organizationId,
    userId: req?.user?.id,
    action,
    entityType,
    entityId: String(entityId ?? ''),
    metadata: metadata || {},
    ip: req?.ip,
    userAgent: req?.get?.('user-agent') || null
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record', action, err.message);
    return null;
  });
};

/** Fire-and-forget variant for non-critical background writes. */
const auditAsync = (req, payload) => {
  audit(req, payload);
};

const list = (orgId, filters) => getDriver().listAuditLogs(orgId, filters);
const listActionTypes = (orgId) => getDriver().listActionTypes(orgId);

module.exports = { audit, auditAsync, list, listActionTypes };
