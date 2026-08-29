import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EvidenceUploader from '../../../components/dispute/EvidenceUploader';

describe('EvidenceUploader keyboard navigation', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(
      () => 'blob:test-file',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('allows the upload zone to receive focus with Tab', async () => {
    const user = userEvent.setup();

    render(<EvidenceUploader />);

    const uploadZone = screen.getByRole(
      'button',
      {
        name: /upload evidence files/i,
      },
    );

    await user.tab();

    expect(uploadZone).toHaveFocus();
  });

  it('opens the file picker when Enter is pressed', () => {
    const { container } = render(
      <EvidenceUploader />,
    );

    const uploadZone = screen.getByRole(
      'button',
      {
        name: /upload evidence files/i,
      },
    );

    const input = container.querySelector(
      'input[type="file"]',
    );

    const clickSpy = jest.spyOn(
      input,
      'click',
    );

    fireEvent.keyDown(uploadZone, {
      key: 'Enter',
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing mouse click behaviour', () => {
    const { container } = render(
      <EvidenceUploader />,
    );

    const uploadZone = screen.getByRole(
      'button',
      {
        name: /upload evidence files/i,
      },
    );

    const input = container.querySelector(
      'input[type="file"]',
    );

    const clickSpy = jest.spyOn(
      input,
      'click',
    );

    fireEvent.click(uploadZone);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('has a visible keyboard focus style on the upload zone', () => {
    render(<EvidenceUploader />);

    const uploadZone = screen.getByRole(
      'button',
      {
        name: /upload evidence files/i,
      },
    );

    expect(uploadZone).toHaveClass(
      'focus-visible:ring-2',
    );

    expect(uploadZone).toHaveClass(
      'focus-visible:ring-indigo-500',
    );
  });

  it('closes the document preview when Escape is pressed', async () => {
    jest.useFakeTimers();

    jest
      .spyOn(Math, 'random')
      .mockReturnValue(1);

    const { container } = render(
      <EvidenceUploader />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    );

    const file = new File(
      ['document content'],
      'contract.pdf',
      {
        type: 'application/pdf',
      },
    );

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    act(() => {
      jest.runAllTimers();
    });

    const previewButton =
      screen.getByRole('button', {
        name: 'Preview contract.pdf',
      });

    fireEvent.click(previewButton);

    const dialog = screen.getByRole(
      'dialog',
      {
        name: 'Preview: contract.pdf',
      },
    );

    expect(dialog).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: 'Close preview',
      }),
    ).toHaveFocus();

    fireEvent.keyDown(dialog, {
      key: 'Escape',
    });

    expect(
      screen.queryByRole('dialog'),
    ).not.toBeInTheDocument();
  });

  it('keeps Tab focus inside the document preview', () => {
    jest.useFakeTimers();

    jest
      .spyOn(Math, 'random')
      .mockReturnValue(1);

    const { container } = render(
      <EvidenceUploader />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    );

    const file = new File(
      ['document content'],
      'agreement.pdf',
      {
        type: 'application/pdf',
      },
    );

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    act(() => {
      jest.runAllTimers();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Preview agreement.pdf',
      }),
    );

    const dialog = screen.getByRole(
      'dialog',
    );

    const closeButton =
      screen.getByRole('button', {
        name: 'Close preview',
      });

    const downloadLink =
      screen.getByRole('link', {
        name: 'Download to view',
      });

    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, {
      key: 'Tab',
      shiftKey: true,
    });

    expect(downloadLink).toHaveFocus();

    fireEvent.keyDown(dialog, {
      key: 'Tab',
    });

    expect(closeButton).toHaveFocus();
  });
});