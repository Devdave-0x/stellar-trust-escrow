import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EvidenceDrafts from '../components/escrow/EvidenceDrafts';
import type { EvidenceDraft } from '../services/evidenceDrafts';

const draft = (overrides: Partial<EvidenceDraft>): EvidenceDraft => ({
  id: 'd1',
  escrowId: '42',
  description: 'Delivered on time',
  createdAt: 0,
  status: 'pending',
  ...overrides,
});

describe('EvidenceDrafts', () => {
  it('saves the typed evidence and clears the field', () => {
    const onSave = jest.fn();
    render(<EvidenceDrafts drafts={[]} onSave={onSave} onDelete={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Evidence description'), 'Delivered on time');
    fireEvent.press(screen.getByText('Save evidence'));

    expect(onSave).toHaveBeenCalledWith('Delivered on time');
    expect(screen.getByLabelText('Evidence description').props.value).toBe('');
  });

  it('shows a validation error instead of saving', () => {
    const onSave = jest.fn(() => {
      throw new Error('Write some evidence before saving.');
    });
    render(<EvidenceDrafts drafts={[]} onSave={onSave} onDelete={jest.fn()} />);

    fireEvent.press(screen.getByText('Save evidence'));

    expect(screen.getByText('Write some evidence before saving.')).toBeTruthy();
  });

  it('lists drafts with their upload state and lets them be deleted', () => {
    const onDelete = jest.fn();
    render(
      <EvidenceDrafts
        drafts={[
          draft({}),
          draft({ id: 'd2', status: 'failed', lastError: 'Access denied', description: 'Other' }),
        ]}
        onSave={jest.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Waiting to upload')).toBeTruthy();
    expect(screen.getByText('Not uploaded: Access denied')).toBeTruthy();
    fireEvent.press(screen.getAllByLabelText('Delete draft')[0]);
    expect(onDelete).toHaveBeenCalledWith('d1');
  });
});
