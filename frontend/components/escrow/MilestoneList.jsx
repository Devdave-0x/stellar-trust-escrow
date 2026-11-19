/**
 * MilestoneList Component
 *
 * Renders the ordered timeline of milestones for an escrow.
 * Clients can add the next milestone while the escrow accepts additions.
 */

'use client';

import { useState } from 'react';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import MilestoneItem from './MilestoneItem';

export default function MilestoneList({
  milestones = [],
  role,
  onApprove,
  onReject,
  onSubmit,
  onAddMilestone,
  canAdd = false,
}) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [descriptionHash, setDescriptionHash] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [formError, setFormError] = useState(null);

  const showAdd = Boolean(canAdd && onAddMilestone && role === 'client');

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError(null);
    const trimmedTitle = title.trim();
    const trimmedHash = descriptionHash.trim();
    if (!trimmedTitle || !trimmedHash || !amount) {
      setFormError('Title, description hash, and amount are required.');
      return;
    }
    setIsAdding(true);
    try {
      await onAddMilestone({
        title: trimmedTitle,
        descriptionHash: trimmedHash,
        amount: String(amount),
      });
      setTitle('');
      setAmount('');
      setDescriptionHash('');
    } catch (err) {
      setFormError(err.message || 'Could not add milestone');
      // Preserve entered values on contract/API errors
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      {milestones.length === 0 ? (
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
      ) : (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-400 font-medium">
                {milestones.filter((m) => m.status === 'Approved').length} of {milestones.length}{' '}
                milestones complete
              </span>
              <span className="text-white font-bold">
                {Math.round(
                  (milestones.filter((m) => m.status === 'Approved').length / milestones.length) *
                    100,
                )}
                %
              </span>
            </div>
            <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-700 ease-out shadow-lg"
                style={{
                  width: `${
                    (milestones.filter((m) => m.status === 'Approved').length / milestones.length) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="relative">
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
        </>
      )}

      {showAdd ? (
        <form onSubmit={handleAdd} className="card space-y-3" data-testid="add-milestone-form">
          <h3 className="text-sm font-semibold text-white">Create next milestone</h3>
          <input
            aria-label="Milestone title"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isAdding}
          />
          <input
            aria-label="Description hash"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            placeholder="Description hash (64-hex)"
            value={descriptionHash}
            onChange={(e) => setDescriptionHash(e.target.value)}
            disabled={isAdding}
          />
          <input
            aria-label="Milestone amount"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="Amount (stroops)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isAdding}
          />
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <Button type="submit" variant="primary" size="sm" disabled={isAdding}>
            {isAdding ? 'Adding…' : 'Add milestone'}
          </Button>
        </form>
      ) : role !== 'client' ? (
        <p className="text-xs text-gray-600">Only the client can add milestones.</p>
      ) : null}
    </div>
  );
}
