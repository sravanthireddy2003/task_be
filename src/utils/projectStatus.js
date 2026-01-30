function normalizeProjectStatus(status, isLocked) {
  const raw = status == null ? null : String(status);
  const upper = raw ? raw.toUpperCase() : '';
  const locked = isLocked === 1 || isLocked === true;

  const isPendingFinalApproval = upper === 'PENDING_FINAL_APPROVAL';
  const isClosed = upper === 'CLOSED' || locked || isPendingFinalApproval;

  return {
    rawStatus: raw,
    status: isClosed ? 'CLOSED' : raw,
    isClosed,
    isLocked: locked,
    isPendingFinalApproval
  };
}

module.exports = { normalizeProjectStatus };
