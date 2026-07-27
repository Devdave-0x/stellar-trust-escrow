/**
 * MilestoneList Component
 *
 * Renders the ordered timeline of milestones for an escrow.
 * Passes role-appropriate action handlers to each MilestoneItem.
 *
 * @param {object}   props
 * @param {Array}    props.milestones        — array of Milestone objects
 * @param {'client'|'freelancer'|'observer'} props.role
 * @param {Function} props.onApprove(id)     — client approves milestone
 * @param {Function} props.onReject(id)      — client rejects milestone
 * @param {Function} props.onSubmit(id)      — freelancer submits milestone
 *
 * TODO (contributor — medium, Issue #40):
 * - Add animated connector line between milestone items
 * - Show total released vs remaining in a summary bar at the top
 * - Handle empty milestones array with an informative empty state
 */

import EmptyState from '../ui/EmptyState';
import MilestoneItem from './MilestoneItem';

export default function MilestoneList({ milestones = [], role, onApprove, onReject, onSubmit }) {
  if (milestones.length === 0) {
    return (
      <div className="card">
        <EmptyState
          type="escrows"
          title="No milestones yet"
          description={
            role === 'client'
              ? 'Add milestones to define the project deliverables.'
              : 'The client has not added any milestones yet.'
          }
        />
      </div>
    );
  }

  // Compute summary stats
  const approvedCount = milestones.filter((m) => m.status === 'Approved').length;
  const totalCount = milestones.length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-400 font-medium">
            {approvedCount} of {totalCount} milestones complete
          </span>
          <span className="text-white font-bold">
            {Math.round((approvedCount / totalCount) * 100)}%
          </span>
        </div>
        {/* Progress bar with gradient and animation */}
        <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-700 ease-out shadow-lg"
            style={{ width: `${(approvedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Milestone Items */}
      <div className="relative">
        {/* Vertical connector line */}
        {/*
          TODO (contributor — Issue #40):
          Add an absolute positioned ::before line connecting items,
          with color indicating overall progress
        */}
        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <MilestoneItem
              key={milestone.id}
              milestone={milestone}
              index={index}
              role={role}
              onApprove={onApprove}
              onReject={onReject}
              onSubmit={onSubmit}
              isLast={index === milestones.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
