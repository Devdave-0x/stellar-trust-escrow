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

      {/* Milestone Items */}
      <div className="relative">
        {/* Vertical connector line */}
        {/*
          TODO (contributor — Issue #40):
          Add an absolute positioned ::before line connecting items,
          with color indicating overall progress
        */}
        <div className="space-y-3">
          {milestones.map((milestone, index) => {
            const milestoneLabel = `milestone ${index + 1}: ${milestone.title}`;
            return (
              <MilestoneItem
                key={milestone.id}
                milestone={milestone}
                index={index}
                role={role}
                onApprove={onApprove}
                onReject={onReject}
                onSubmit={onSubmit}
                isLast={index === milestones.length - 1}
                actionLabels={{
                  approve: `Approve ${milestoneLabel}`,
                  reject: `Reject ${milestoneLabel}`,
                  submit: `Submit ${milestoneLabel}`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
