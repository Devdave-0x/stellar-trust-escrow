import { cn } from '../../lib/utils';

export type MilestoneStatus = 'pending' | 'approved' | 'disputed';

export interface Milestone {
  id: string;
  title: string;
  amount: string;
  status: MilestoneStatus;
}

interface MilestoneTimelineProps {
  milestones: Milestone[];
  className?: string;
}

const statusMeta: Record<
  MilestoneStatus,
  { label: string; dot: string; text: string; icon: string }
> = {
  pending: { label: 'Pending', dot: 'bg-gray-500', text: 'text-gray-400', icon: '○' },
  approved: { label: 'Approved', dot: 'bg-green-500', text: 'text-green-300', icon: '✓' },
  disputed: { label: 'Disputed', dot: 'bg-red-500', text: 'text-red-300', icon: '!' },
};

/**
 * Vertical timeline of escrow milestones. Each step communicates its status via
 * both a coloured dot and a text label (not colour alone).
 */
export default function MilestoneTimeline({ milestones, className }: MilestoneTimelineProps) {
  return (
    <ol className={cn('space-y-0', className)} aria-label="Milestone progress">
      {milestones.map((milestone, index) => {
        const meta = statusMeta[milestone.status];
        const isLast = index === milestones.length - 1;
        return (
          <li key={milestone.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[11px] top-6 h-full w-0.5 bg-gray-700"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                meta.dot,
                meta.text,
              )}
            >
              {meta.icon}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-white">{milestone.title}</h3>
                <span className={cn('text-xs font-medium', meta.text)}>{meta.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">{milestone.amount} XLM</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
