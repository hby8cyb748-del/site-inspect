// Shared set-up for the logic tests. Run them with: npm test
import * as M from '../js/incident/model.js';

export const advisor = { by: 'Test Advisor', role: 'advisor' };
export const manager = { by: 'Test Manager', role: 'manager' };
export const reviewer = { by: 'Test Reviewer', role: 'reviewer' };
export const viewer = { by: 'Test Viewer', role: 'viewer' };

export const newIncident = (start = {}) => M.createIncident(advisor, { what: 'Test event', where: 'Test area', ...start });
export const openTexts = (inc) => M.openItems(inc).map((i) => i.text);
export const obtainedEvidence = (inc, description = 'Test photo') => M.addRecord(inc, advisor, 'evidence', { kind: 'Photograph', description });
export const rule = (fn, pattern) => {
  try {
    fn();
  } catch (err) {
    if (!err.rule) throw err;
    if (pattern && !pattern.test(err.message)) throw new Error(`Rule message "${err.message}" did not match ${pattern}`);
    return err;
  }
  throw new Error('Expected a rule to stop this, but it was allowed');
};
